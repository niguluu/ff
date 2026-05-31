export interface VisualLine {
  text: string;
  lineIndex: number;
  startCol: number;
  endCol: number;
}

export function wrapInputToVisualLines(input: string, width: number): VisualLine[] {
  const result: VisualLine[] = [];
  const lines = input.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.length === 0) {
      result.push({ text: "", lineIndex: i, startCol: 0, endCol: 0 });
    } else if (line.length <= width) {
      result.push({ text: line, lineIndex: i, startCol: 0, endCol: line.length });
    } else {
      let chunkStart = 0;
      let currentWidth = 0;
      let wrapOpp = -1;

      for (let j = 0; j < line.length; j++) {
        const char = line[j]!;

        if (currentWidth + 1 > width) {
          if (wrapOpp > chunkStart) {
            result.push({
              text: line.slice(chunkStart, wrapOpp),
              lineIndex: i,
              startCol: chunkStart,
              endCol: wrapOpp,
            });
            chunkStart = wrapOpp;
            currentWidth = j - chunkStart;
          } else {
            result.push({
              text: line.slice(chunkStart, j),
              lineIndex: i,
              startCol: chunkStart,
              endCol: j,
            });
            chunkStart = j;
            currentWidth = 0;
          }
          wrapOpp = -1;
        }

        currentWidth++;
        const next = line[j + 1];
        if (char === " " && next && next !== " ") {
          wrapOpp = j + 1;
        }
      }

      result.push({
        text: line.slice(chunkStart),
        lineIndex: i,
        startCol: chunkStart,
        endCol: line.length,
      });
    }
  }

  return result;
}

export function getCursorVisualInfo(input: string, cursorPos: number, width: number) {
  const beforeCursor = input.slice(0, cursorPos);
  const cursorLine = beforeCursor.split("\n").length - 1;
  const cursorCol = cursorPos - (input.lastIndexOf("\n", cursorPos - 1) + 1);

  const visualLines = wrapInputToVisualLines(input, width);
  const visualLineIndex = visualLines.findIndex(
    (vl) => vl.lineIndex === cursorLine && cursorCol >= vl.startCol && cursorCol <= vl.endCol
  );

  return {
    visualLines,
    cursorLine,
    cursorCol,
    visualLineIndex: visualLineIndex === -1 ? 0 : visualLineIndex,
  };
}

export function moveCursorUpVisual(
  input: string,
  cursorPos: number,
  width: number,
  preferredVisualCol?: number
): number {
  const { visualLines, cursorCol, visualLineIndex } = getCursorVisualInfo(input, cursorPos, width);
  if (visualLineIndex <= 0) return cursorPos;

  const currentVL = visualLines[visualLineIndex]!;
  const targetVL = visualLines[visualLineIndex - 1]!;
  const visualCol = preferredVisualCol ?? cursorCol - currentVL.startCol;

  const lines = input.split("\n");
  const targetLine = lines[targetVL.lineIndex] ?? "";
  const targetCol = targetVL.startCol + Math.min(visualCol, targetVL.text.length);

  let newPos = 0;
  for (let i = 0; i < targetVL.lineIndex; i++) {
    newPos += lines[i]!.length + 1;
  }
  newPos += Math.min(targetCol, targetLine.length);

  return newPos;
}

export function moveCursorDownVisual(
  input: string,
  cursorPos: number,
  width: number,
  preferredVisualCol?: number
): number {
  const { visualLines, cursorCol, visualLineIndex } = getCursorVisualInfo(input, cursorPos, width);
  if (visualLineIndex >= visualLines.length - 1) return cursorPos;

  const currentVL = visualLines[visualLineIndex]!;
  const targetVL = visualLines[visualLineIndex + 1]!;
  const visualCol = preferredVisualCol ?? cursorCol - currentVL.startCol;

  const lines = input.split("\n");
  const targetLine = lines[targetVL.lineIndex] ?? "";
  const targetCol = targetVL.startCol + Math.min(visualCol, targetVL.text.length);

  let newPos = 0;
  for (let i = 0; i < targetVL.lineIndex; i++) {
    newPos += lines[i]!.length + 1;
  }
  newPos += Math.min(targetCol, targetLine.length);

  return newPos;
}

export function countVisualLines(input: string, width: number): number {
  return wrapInputToVisualLines(input, width).length;
}

export function getCursorVisualLineIndex(input: string, cursorPos: number, width: number): number {
  return getCursorVisualInfo(input, cursorPos, width).visualLineIndex;
}

export function getCursorVisualCol(input: string, cursorPos: number, width: number): number {
  const { visualLines, cursorCol, visualLineIndex } = getCursorVisualInfo(input, cursorPos, width);
  const currentVL = visualLines[visualLineIndex];
  return currentVL ? cursorCol - currentVL.startCol : cursorCol;
}

export function getTotalVisualLines(input: string, width: number): number {
  return wrapInputToVisualLines(input, width).length;
}
