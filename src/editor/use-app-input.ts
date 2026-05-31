import { useInput } from "ink";
import { extractToolInvocations, type Message } from "../llm/llm";
import { parseToolDisplay } from "../utils/message-format";
import { copyToClipboard } from "../utils/clipboard";
import {
  backspaceText,
  insertText,
  killToLineEnd,
  killToLineStart,
  killWordBackward,
  killWordForward,
  moveCursorToLineEnd,
  moveCursorToLineStart,
  navigateHistoryDown,
  navigateHistoryUp,
  type InputEditorState,
  type InputHistoryRefs,
} from "./input-editor";
import {
  getCursorVisualCol,
  getCursorVisualLineIndex,
  getTotalVisualLines,
  moveCursorDownVisual,
  moveCursorUpVisual,
} from "../utils/pi-prompt-utils";
import { findWordBackward, findWordForward } from "../utils/word-navigation";
import { prevGraphemeBoundary, nextGraphemeBoundary } from "../utils/text-segmentation";
import type { KillRing } from "./kill-ring";
import type { UndoStack } from "./undo-stack";
import type { PasteStore } from "../utils/paste";
import { isLargePaste, normalizePaste } from "../utils/paste";

type UseAppInputArgs = {
  exit: () => void;
  messages: Message[];
  input: string;
  cursorPos: number;
  status: "idle" | "thinking";
  msgAreaHeight: number;
  promptMaxContentHeight: number;
  termCols: number;
  historyRefs: InputHistoryRefs;
  killRing: KillRing;
  undoStack: UndoStack<InputEditorState>;
  preferredColRef: { current: number | null };
  pasteStore: PasteStore;
  setInput: (value: string) => void;
  setCursorPos: (value: number | ((prev: number) => number)) => void;
  setScrollLines: (value: number | ((prev: number) => number)) => void;
  setExpandedTools: (value: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  setCopyFeedback: (value: string) => void;
  clearCopyFeedbackLater: () => void;
  onSubmit: (text: string) => void;
};

export function useAppInput(args: UseAppInputArgs) {
  const {
    exit,
    messages,
    input,
    cursorPos,
    status,
    msgAreaHeight,
    promptMaxContentHeight,
    termCols,
    historyRefs,
    killRing,
    undoStack,
    preferredColRef,
    pasteStore,
    setInput,
    setCursorPos,
    setScrollLines,
    setExpandedTools,
    setCopyFeedback,
    clearCopyFeedbackLater,
    onSubmit,
  } = args;

  const promptContentWidth = Math.max(1, termCols - 2);

  function detectEnterEscape(char: string): { shift: boolean } | null {
    const m =
      /\x1b?\[27;(\d+);13~/.exec(char) || /\x1b?\[13;(\d+)u/.exec(char);
    if (!m) return null;
    const mods = Number(m[1]) - 1;
    return { shift: (mods & 1) === 1 };
  }

  function detectMouseEvent(char: string): "up" | "down" | "other" | null {
    const m = /\x1b?\[<(\d+);\d+;\d+[Mm]/.exec(char);
    if (!m) return null;
    const button = Number(m[1]);
    if ((button & 64) === 0) return "other";
    return (button & 1) === 1 ? "down" : "up";
  }

  function submitInput() {
    if (input.trim().length === 0 && !input.includes("\n")) return;
    const expanded = pasteStore.expand(input);
    setInput("");
    setCursorPos(0);
    historyRefs.history.current.push(expanded);
    historyRefs.historyIndex.current = -1;
    historyRefs.savedInput.current = "";
    undoStack.clear();
    pasteStore.clear();
    preferredColRef.current = null;
    setScrollLines(0);
    onSubmit(expanded);
  }

  function commitEdit(next: InputEditorState, resetPreferredCol = true) {
    undoStack.push({ input, cursorPos });
    setInput(next.input);
    setCursorPos(next.cursorPos);
    if (resetPreferredCol) preferredColRef.current = null;
  }

  function moveCursorTo(pos: number) {
    setCursorPos(pos);
    preferredColRef.current = null;
  }

  useInput((char, key) => {
    if (char && char.length > 1) {
      const mouse = detectMouseEvent(char);
      if (mouse) {
        const WHEEL_STEP = 3;
        if (mouse === "up") {
          setScrollLines((prev) => prev + WHEEL_STEP);
        } else if (mouse === "down") {
          setScrollLines((prev) => Math.max(0, prev - WHEEL_STEP));
        }
        return;
      }
    }

    if ((key.ctrl && char === "c") || key.escape) {
      exit();
      return;
    }

    if (key.ctrl && char === "o") {
      const lastAssistant = [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === "assistant" &&
            extractToolInvocations(message.content).invocations.length === 0 &&
            message.content.trim().length > 0
        );
      if (lastAssistant) {
        copyToClipboard(lastAssistant.content);
        setCopyFeedback("copied!");
        clearCopyFeedbackLater();
      }
      return;
    }

    if (key.ctrl && char === "e") {
      const lastToolIdx = messages.findLastIndex((message) => parseToolDisplay(message.content));
      if (lastToolIdx !== -1) {
        setExpandedTools((prev) => {
          const next = new Set(prev);
          if (next.has(lastToolIdx)) next.delete(lastToolIdx);
          else next.add(lastToolIdx);
          return next;
        });
      }
      return;
    }

    if (key.pageUp || key.pageDown) {
      const totalLines = getTotalVisualLines(input, promptContentWidth);
      const promptOverflows = status === "idle" && totalLines > promptMaxContentHeight;
      if (promptOverflows) {
        if (preferredColRef.current === null) {
          preferredColRef.current = getCursorVisualCol(input, cursorPos, promptContentWidth);
        }
        let pos = cursorPos;
        const move = key.pageUp ? moveCursorUpVisual : moveCursorDownVisual;
        for (let i = 0; i < promptMaxContentHeight; i++) {
          pos = move(input, pos, promptContentWidth, preferredColRef.current ?? undefined);
        }
        setCursorPos(pos);
        return;
      }
      if (key.pageUp) {
        setScrollLines((prev) => prev + Math.floor(msgAreaHeight / 2));
      } else {
        setScrollLines((prev) => Math.max(0, prev - Math.floor(msgAreaHeight / 2)));
      }
      return;
    }

    if (status !== "idle") return;

    if ((key.ctrl && (char === "/" || char === "_")) || char === "\x1f") {
      const prev = undoStack.pop();
      if (prev) {
        setInput(prev.input);
        setCursorPos(prev.cursorPos);
        preferredColRef.current = null;
      }
      return;
    }

    if (char && char.length > 1) {
      const enter = detectEnterEscape(char);
      if (enter) {
        if (enter.shift) {
          commitEdit(insertText({ input, cursorPos }, "\n"));
        } else {
          submitInput();
        }
        return;
      }
    }

    if (key.return && !key.shift) {
      submitInput();
      return;
    }

    if (key.return && key.shift) {
      commitEdit(insertText({ input, cursorPos }, "\n"));
      return;
    }

    if (key.meta && (key.backspace || key.delete)) {
      const result = killWordBackward({ input, cursorPos });
      killRing.push(result.killed, { prepend: true });
      commitEdit(result.state);
      return;
    }

    if (key.backspace || key.delete) {
      commitEdit(backspaceText({ input, cursorPos }));
      return;
    }

    if (key.meta && char === "d") {
      const result = killWordForward({ input, cursorPos });
      killRing.push(result.killed, { prepend: false });
      commitEdit(result.state);
      return;
    }

    if ((key.ctrl || key.meta) && key.leftArrow) {
      moveCursorTo(findWordBackward(input, cursorPos));
      return;
    }
    if ((key.ctrl || key.meta) && key.rightArrow) {
      moveCursorTo(findWordForward(input, cursorPos));
      return;
    }

    if (key.leftArrow) {
      moveCursorTo(prevGraphemeBoundary(input, cursorPos));
      return;
    }

    if (key.rightArrow) {
      moveCursorTo(nextGraphemeBoundary(input, cursorPos));
      return;
    }

    if (key.upArrow) {
      const visualLine = getCursorVisualLineIndex(input, cursorPos, promptContentWidth);
      if (visualLine > 0) {
        if (preferredColRef.current === null) {
          preferredColRef.current = getCursorVisualCol(input, cursorPos, promptContentWidth);
        }
        setCursorPos(
          moveCursorUpVisual(input, cursorPos, promptContentWidth, preferredColRef.current ?? undefined)
        );
        return;
      }
      const historyState = navigateHistoryUp({ input, cursorPos }, historyRefs);
      if (historyState) {
        setInput(historyState.input);
        setCursorPos(historyState.cursorPos);
        preferredColRef.current = null;
      }
      return;
    }

    if (key.downArrow) {
      const visualLine = getCursorVisualLineIndex(input, cursorPos, promptContentWidth);
      const totalLines = getTotalVisualLines(input, promptContentWidth);
      if (visualLine < totalLines - 1) {
        if (preferredColRef.current === null) {
          preferredColRef.current = getCursorVisualCol(input, cursorPos, promptContentWidth);
        }
        setCursorPos(
          moveCursorDownVisual(input, cursorPos, promptContentWidth, preferredColRef.current ?? undefined)
        );
        return;
      }
      const historyState = navigateHistoryDown(historyRefs);
      if (historyState) {
        setInput(historyState.input);
        setCursorPos(historyState.cursorPos);
        preferredColRef.current = null;
      }
      return;
    }

    if (key.ctrl && char === "a") {
      moveCursorTo(moveCursorToLineStart(input, cursorPos));
      return;
    }

    if (key.ctrl && char === "f") {
      moveCursorTo(moveCursorToLineEnd(input, cursorPos));
      return;
    }

    if (key.ctrl && char === "k") {
      const result = killToLineEnd({ input, cursorPos });
      killRing.push(result.killed, { prepend: false });
      commitEdit(result.state);
      return;
    }

    if (key.ctrl && char === "u") {
      const result = killToLineStart({ input, cursorPos });
      killRing.push(result.killed, { prepend: true });
      commitEdit(result.state);
      return;
    }

    if (key.ctrl && char === "w") {
      const result = killWordBackward({ input, cursorPos });
      killRing.push(result.killed, { prepend: true });
      commitEdit(result.state);
      return;
    }

    if (key.ctrl && char === "y") {
      const text = killRing.peek();
      if (text) commitEdit(insertText({ input, cursorPos }, text));
      return;
    }

    if (!key.ctrl && !key.meta && char) {
      if (char.length > 1) {
        const normalized = normalizePaste(char);
        if (!normalized) return;
        const toInsert = isLargePaste(normalized) ? pasteStore.add(normalized) : normalized;
        commitEdit(insertText({ input, cursorPos }, toInsert));
        return;
      }
      commitEdit(insertText({ input, cursorPos }, char));
    }
  });
}
