import { nextGraphemeBoundary, prevGraphemeBoundary } from "../utils/text-segmentation";
import { findWordBackward, findWordForward } from "../utils/word-navigation";

export type InputHistoryRefs = {
  history: { current: string[] };
  historyIndex: { current: number };
  savedInput: { current: string };
};

export type InputEditorState = {
  input: string;
  cursorPos: number;
};

export type InputEditorActions = {
  setInput: (value: string) => void;
  setCursorPos: (value: number | ((prev: number) => number)) => void;
};

export function insertText(state: InputEditorState, text: string) {
  const before = state.input.slice(0, state.cursorPos);
  const after = state.input.slice(state.cursorPos);
  return {
    input: before + text + after,
    cursorPos: state.cursorPos + text.length,
  };
}

export function backspaceText(state: InputEditorState) {
  if (state.cursorPos <= 0) return state;
  const start = prevGraphemeBoundary(state.input, state.cursorPos);
  const before = state.input.slice(0, start);
  const after = state.input.slice(state.cursorPos);
  return {
    input: before + after,
    cursorPos: start,
  };
}

export function deleteForwardText(state: InputEditorState) {
  if (state.cursorPos >= state.input.length) return state;
  const end = nextGraphemeBoundary(state.input, state.cursorPos);
  return {
    input: state.input.slice(0, state.cursorPos) + state.input.slice(end),
    cursorPos: state.cursorPos,
  };
}

export type KillResult = { state: InputEditorState; killed: string };

export function killToLineEnd(state: InputEditorState): KillResult {
  const { input, cursorPos } = state;
  let end = moveCursorToLineEnd(input, cursorPos);
  if (end === cursorPos && input[cursorPos] === "\n") {
    end = cursorPos + 1;
  }
  const killed = input.slice(cursorPos, end);
  return {
    state: { input: input.slice(0, cursorPos) + input.slice(end), cursorPos },
    killed,
  };
}

export function killToLineStart(state: InputEditorState): KillResult {
  const { input, cursorPos } = state;
  const start = moveCursorToLineStart(input, cursorPos);
  const killed = input.slice(start, cursorPos);
  return {
    state: { input: input.slice(0, start) + input.slice(cursorPos), cursorPos: start },
    killed,
  };
}

export function killWordBackward(state: InputEditorState): KillResult {
  const { input, cursorPos } = state;
  const start = findWordBackward(input, cursorPos);
  const killed = input.slice(start, cursorPos);
  return {
    state: { input: input.slice(0, start) + input.slice(cursorPos), cursorPos: start },
    killed,
  };
}

export function killWordForward(state: InputEditorState): KillResult {
  const { input, cursorPos } = state;
  const end = findWordForward(input, cursorPos);
  const killed = input.slice(cursorPos, end);
  return {
    state: { input: input.slice(0, cursorPos) + input.slice(end), cursorPos },
    killed,
  };
}

export function moveCursorUp(input: string, cursorPos: number) {
  const beforeCursor = input.slice(0, cursorPos);
  const cursorRow = beforeCursor.split("\n").length - 1;
  if (cursorRow <= 0) return cursorPos;
  const lines = input.split("\n");
  const currentCol = cursorPos - (input.lastIndexOf("\n", cursorPos - 1) + 1);
  const prevLineStart =
    lines.slice(0, cursorRow - 1).join("\n").length + (cursorRow - 1 > 0 ? 1 : 0);
  const prevLine = lines[cursorRow - 1] ?? "";
  return prevLineStart + Math.min(currentCol, prevLine.length);
}

export function moveCursorDown(input: string, cursorPos: number) {
  const beforeCursor = input.slice(0, cursorPos);
  const cursorRow = beforeCursor.split("\n").length - 1;
  const lines = input.split("\n");
  if (cursorRow >= lines.length - 1) return cursorPos;
  const currentCol = cursorPos - (input.lastIndexOf("\n", cursorPos - 1) + 1);
  const nextLineStart = lines.slice(0, cursorRow + 1).join("\n").length + 1;
  const nextLine = lines[cursorRow + 1] ?? "";
  return nextLineStart + Math.min(currentCol, nextLine.length);
}

export function moveCursorToLineStart(input: string, cursorPos: number) {
  return input.lastIndexOf("\n", cursorPos - 1) + 1;
}

export function moveCursorToLineEnd(input: string, cursorPos: number) {
  const lineEnd = input.indexOf("\n", cursorPos);
  return lineEnd === -1 ? input.length : lineEnd;
}

export function navigateHistoryUp(
  state: InputEditorState,
  refs: InputHistoryRefs
): InputEditorState | null {
  if (refs.historyIndex.current === -1) {
    refs.savedInput.current = state.input;
  }
  if (refs.historyIndex.current >= refs.history.current.length - 1) {
    return null;
  }
  refs.historyIndex.current++;
  const idx = refs.history.current.length - 1 - refs.historyIndex.current;
  const text = refs.history.current[idx] ?? "";
  return { input: text, cursorPos: text.length };
}

export function navigateHistoryDown(refs: InputHistoryRefs): InputEditorState | null {
  if (refs.historyIndex.current > 0) {
    refs.historyIndex.current--;
    const idx = refs.history.current.length - 1 - refs.historyIndex.current;
    const text = refs.history.current[idx] ?? "";
    return { input: text, cursorPos: text.length };
  }
  if (refs.historyIndex.current === 0) {
    refs.historyIndex.current = -1;
    return {
      input: refs.savedInput.current,
      cursorPos: refs.savedInput.current.length,
    };
  }
  return null;
}
