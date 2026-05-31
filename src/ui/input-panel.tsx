import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { MUTED_COLOR, TEXT_COLOR, YOU_COLOR } from "../core/config";
import { wrapInputToVisualLines } from "../utils/pi-prompt-utils";
import { firstGrapheme } from "../utils/text-segmentation";
import { FillLines } from "./theme";

type InputPanelProps = {
  input: string;
  cursorPos: number;
  width: number;
  maxVisibleLines: number;
  status: "idle" | "thinking";
};

const PADDING_X = 1;

export function InputPanel({ input, cursorPos, width, maxVisibleLines, status }: InputPanelProps) {
  const contentWidth = Math.max(1, width - PADDING_X * 2);
  const isIdle = status === "idle";

  const { visibleLines } = useMemo(() => {
    const beforeCursor = input.slice(0, cursorPos);
    const cursorLine = beforeCursor.split("\n").length - 1;
    const cursorCol = cursorPos - (input.lastIndexOf("\n", cursorPos - 1) + 1);

    const vlines = wrapInputToVisualLines(input, contentWidth);
    const linesWithCursor = vlines.map((vl) => {
      const isCursorLine = cursorLine === vl.lineIndex && cursorCol >= vl.startCol && cursorCol <= vl.endCol;
      return {
        ...vl,
        isCursorLine,
        cursorOffset: isCursorLine ? cursorCol - vl.startCol : 0,
      };
    });

    const cursorVisualLine = linesWithCursor.findIndex((l) => l.isCursorLine);
    let scrollOffset = 0;
    if (cursorVisualLine >= maxVisibleLines) {
      scrollOffset = cursorVisualLine - maxVisibleLines + 1;
    }
    const maxScrollOffset = Math.max(0, linesWithCursor.length - maxVisibleLines);
    scrollOffset = Math.max(0, Math.min(scrollOffset, maxScrollOffset));

    const visible = linesWithCursor.slice(scrollOffset, scrollOffset + maxVisibleLines);

    return { visibleLines: visible };
  }, [input, cursorPos, contentWidth, maxVisibleLines]);

  const isEmpty = input.length === 0;

  const leading = " ".repeat(PADDING_X);
  function renderLine(
    line: { text: string; lineIndex: number; isCursorLine: boolean; cursorOffset: number },
    lineIdx: number
  ) {
    const isFirst = line.lineIndex === 0 && lineIdx === 0;
    const prefix = isFirst ? "> " : "  ";
    const availableWidth = Math.max(0, contentWidth - prefix.length);
    const displayText = line.text.slice(0, availableWidth);
    const fill = (bodyWidth: number) =>
      " ".repeat(Math.max(0, width - PADDING_X - prefix.length - bodyWidth));

    if (isEmpty && isFirst) {
      const hint = isIdle ? "Ask fff to inspect, edit, debug, or build…" : "";
      return (
        <Box flexDirection="row" width={width} overflow="hidden">
          <Text>{leading}</Text>
          <Text color={YOU_COLOR} bold>{prefix}</Text>
          <Text inverse>{" "}</Text>
          {isIdle && (
            <Text color={MUTED_COLOR}>
              {hint}
            </Text>
          )}
          <Text>{fill(1 + hint.length)}</Text>
        </Box>
      );
    }

    if (line.isCursorLine) {
      const beforeCursor = displayText.slice(0, line.cursorOffset);
      const rest = displayText.slice(line.cursorOffset);
      const atCursor = firstGrapheme(rest) ?? " ";
      const afterCursor = rest.slice(atCursor === " " && rest.length === 0 ? 0 : atCursor.length);

      return (
        <Box flexDirection="row" width={width} overflow="hidden">
          <Text>{leading}</Text>
          <Text color={isFirst ? YOU_COLOR : MUTED_COLOR} bold={isFirst}>{prefix}</Text>
          <Text color={TEXT_COLOR}>{beforeCursor}</Text>
          <Text inverse>{atCursor}</Text>
          <Text color={TEXT_COLOR}>{afterCursor}</Text>
          <Text>{fill(beforeCursor.length + 1 + afterCursor.length)}</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="row" width={width} overflow="hidden">
        <Text>{leading}</Text>
        <Text color={isFirst ? YOU_COLOR : MUTED_COLOR}>
          {prefix}
        </Text>
        <Text color={TEXT_COLOR}>{displayText}</Text>
        <Text>{fill(displayText.length)}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={width} overflow="hidden">
      <Box flexDirection="column" width={width} height={maxVisibleLines} overflow="hidden">
        {visibleLines.map((line, idx) => (
          <Box key={idx} flexDirection="row" width={width} overflow="hidden">
            {renderLine(line, idx)}
          </Box>
        ))}
        <FillLines count={Math.max(0, maxVisibleLines - visibleLines.length)} width={width} />
      </Box>
    </Box>
  );
}
