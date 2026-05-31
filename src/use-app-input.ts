import { useInput } from "ink";
import { extractToolInvocations, type Message } from "./llm.js";
import { parseToolDisplay } from "./message-format.js";
import { copyToClipboard } from "./clipboard.js";
import {
  backspaceText,
  insertText,
  moveCursorDown,
  moveCursorToLineEnd,
  moveCursorToLineStart,
  moveCursorUp,
  navigateHistoryDown,
  navigateHistoryUp,
  type InputHistoryRefs,
} from "./input-editor.js";

type UseAppInputArgs = {
  exit: () => void;
  messages: Message[];
  input: string;
  cursorPos: number;
  status: "idle" | "thinking";
  msgAreaHeight: number;
  historyRefs: InputHistoryRefs;
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
    historyRefs,
    setInput,
    setCursorPos,
    setScrollLines,
    setExpandedTools,
    setCopyFeedback,
    clearCopyFeedbackLater,
    onSubmit,
  } = args;

  useInput((char, key) => {
    if ((key.ctrl && char === "c") || key.escape) {
      exit();
      return;
    }

    if (key.ctrl && char === "y") {
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

    if (key.pageUp) {
      setScrollLines((prev) => prev + Math.floor(msgAreaHeight / 2));
      return;
    }

    if (key.pageDown) {
      setScrollLines((prev) => Math.max(0, prev - Math.floor(msgAreaHeight / 2)));
      return;
    }

    if (status !== "idle") return;

    if (key.return && !key.shift) {
      if (input.trim().length > 0 || input.includes("\n")) {
        const text = input;
        setInput("");
        setCursorPos(0);
        historyRefs.history.current.push(text);
        historyRefs.historyIndex.current = -1;
        historyRefs.savedInput.current = "";
        setScrollLines(0);
        onSubmit(text);
      }
      return;
    }

    if (key.return && key.shift) {
      const next = insertText({ input, cursorPos }, "\n");
      setInput(next.input);
      setCursorPos(next.cursorPos);
      return;
    }

    if (key.backspace || key.delete) {
      const next = backspaceText({ input, cursorPos });
      setInput(next.input);
      setCursorPos(next.cursorPos);
      return;
    }

    if (key.leftArrow) {
      setCursorPos((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.rightArrow) {
      setCursorPos((prev) => Math.min(input.length, prev + 1));
      return;
    }

    if (key.upArrow) {
      const multiLineTarget = moveCursorUp(input, cursorPos);
      if (multiLineTarget !== cursorPos) {
        setCursorPos(multiLineTarget);
        return;
      }
      const historyState = navigateHistoryUp({ input, cursorPos }, historyRefs);
      if (historyState) {
        setInput(historyState.input);
        setCursorPos(historyState.cursorPos);
      }
      return;
    }

    if (key.downArrow) {
      const multiLineTarget = moveCursorDown(input, cursorPos);
      if (multiLineTarget !== cursorPos) {
        setCursorPos(multiLineTarget);
        return;
      }
      const historyState = navigateHistoryDown(historyRefs);
      if (historyState) {
        setInput(historyState.input);
        setCursorPos(historyState.cursorPos);
      }
      return;
    }

    if (key.ctrl && char === "a") {
      setCursorPos(moveCursorToLineStart(input, cursorPos));
      return;
    }

    if (key.ctrl && char === "f") {
      setCursorPos(moveCursorToLineEnd(input, cursorPos));
      return;
    }

    if (!key.ctrl && !key.meta && char) {
      const next = insertText({ input, cursorPos }, char);
      setInput(next.input);
      setCursorPos(next.cursorPos);
    }
  });
}
