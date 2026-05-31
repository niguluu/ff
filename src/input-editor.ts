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
  const before = state.input.slice(0, state.cursorPos - 1);
  const after = state.input.slice(state.cursorPos);
  return {
    input: before + after,
    cursorPos: state.cursorPos - 1,
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
