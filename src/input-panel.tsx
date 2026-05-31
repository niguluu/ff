import React from "react";
import { Box, Text } from "ink";
import { BORDER_COLOR, MUTED_COLOR, STATUS_BUSY_COLOR, TEXT_COLOR, YOU_COLOR } from "./config.js";

type InputPanelProps = {
  input: string;
  cursorPos: number;
  width: number;
  status: "idle" | "thinking";
};

function renderLineWithCursor(line: string, cursorOffset: number, showCursor: boolean) {
  const beforeCursor = line.slice(0, cursorOffset);
  const afterCursor = line.slice(cursorOffset);

  return (
    <>
      <Text color={TEXT_COLOR}>{beforeCursor}</Text>
      {showCursor && <Text color={TEXT_COLOR}>{"█"}</Text>}
      <Text color={TEXT_COLOR}>{afterCursor}</Text>
    </>
  );
}

export function InputPanel({ input, cursorPos, width, status }: InputPanelProps) {
  const lines = input.split("\n");
  const boxWidth = Math.max(20, width);
  const innerWidth = Math.max(1, boxWidth - 4);
  const isIdle = status === "idle";
  const isEmpty = input.length === 0;
  const title = isIdle ? " prompt " : " prompt · busy ";
  const hint = isIdle
    ? "Enter send • Shift+Enter newline"
    : "Assistant is working…";

  return (
    <Box flexDirection="column" width={boxWidth} marginTop={1}>
      <Box flexDirection="row" width={boxWidth} overflow="hidden">
        <Text color={BORDER_COLOR}>{"┌"}</Text>
        <Text color={YOU_COLOR} bold>{title}</Text>
        <Text color={BORDER_COLOR}>{"─".repeat(Math.max(0, boxWidth - title.length - 2))}</Text>
        <Text color={BORDER_COLOR}>{"┐"}</Text>
      </Box>

      <Box flexDirection="column" width={boxWidth} overflow="hidden">
        <Box flexDirection="row" width={boxWidth} overflow="hidden">
          <Text color={BORDER_COLOR}>{"│ "}</Text>
          {isEmpty ? (
            <>
              {isIdle && <Text color={MUTED_COLOR} dimColor>{"Ask fff to inspect, edit, debug, or build…"}</Text>}
              {!isIdle && <Text color={STATUS_BUSY_COLOR} dimColor>{"Working…"}</Text>}
              {isIdle && <Text color={TEXT_COLOR}>{"█"}</Text>}
            </>
          ) : null}
          <Box flexDirection="column" width={innerWidth}>
            {lines.map((line, lineIdx) => {
              const lineStart =
                lines.slice(0, lineIdx).join("\n").length + (lineIdx > 0 ? 1 : 0);
              const lineEnd = lineStart + line.length;
              const isCursorLine = cursorPos >= lineStart && cursorPos <= lineEnd;
              const cursorOffset = cursorPos - lineStart;

              return (
                <Box key={lineIdx} flexDirection="row" width={innerWidth} overflow="hidden">
                  {lineIdx === 0 && <Text color={YOU_COLOR} bold>{"> "}</Text>}
                  {lineIdx > 0 && <Text color={MUTED_COLOR}>{"· "}</Text>}
                  {isCursorLine
                    ? renderLineWithCursor(line, cursorOffset, isIdle)
                    : <Text color={TEXT_COLOR}>{line}</Text>}
                </Box>
              );
            })}
          </Box>
          <Text color={BORDER_COLOR}>{" │"}</Text>
        </Box>
      </Box>

      <Box flexDirection="row" width={boxWidth} overflow="hidden">
        <Text color={BORDER_COLOR}>{"└"}</Text>
        <Text color={BORDER_COLOR}>{"─".repeat(Math.max(0, boxWidth - hint.length - 2))}</Text>
        <Text color={MUTED_COLOR} dimColor>{hint}</Text>
        <Text color={BORDER_COLOR}>{"┘"}</Text>
      </Box>
    </Box>
  );
}
