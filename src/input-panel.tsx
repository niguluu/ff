import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { MUTED_COLOR, PROMPT_ACCENT_COLOR, TEXT_COLOR, YOU_COLOR } from "./config.js";
import { wrapInputToVisualLines } from "./pi-prompt-utils.js";
import { firstGrapheme } from "./text-segmentation.js";

type InputPanelProps = {
  input: string;
  cursorPos: number;
  width: number;
  /** Number of content rows reserved for the prompt (computed by App). */
  maxVisibleLines: number;
  status: "idle" | "thinking";
};

const PADDING_X = 1;
const LABEL = "\u2500 prompt ";

export function InputPanel({ input, cursorPos, width, maxVisibleLines, status }: InputPanelProps) {
  const contentWidth = Math.max(1, width - PADDING_X * 2);
  const isIdle = status === "idle";

  const { visibleLines, scrollOffset, linesBelow } = useMemo(() => {
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
    let so = 0;
    if (cursorVisualLine >= maxVisibleLines) {
      so = cursorVisualLine - maxVisibleLines + 1;
    }
    const maxScrollOffset = Math.max(0, linesWithCursor.length - maxVisibleLines);
    so = Math.max(0, Math.min(so, maxScrollOffset));

    const visible = linesWithCursor.slice(so, so + maxVisibleLines);
    const below = linesWithCursor.length - (so + visible.length);

    return { visibleLines: visible, scrollOffset: so, linesBelow: below };
  }, [input, cursorPos, contentWidth, maxVisibleLines]);

  const isEmpty = input.length === 0;
  const topBorder = scrollOffset > 0
    ? `─── ↑ ${scrollOffset} more `
    : "";
  const bottomBorder = linesBelow > 0
    ? `─── ↓ ${linesBelow} more `
    : "";

  function renderLine(
    line: { text: string; lineIndex: number; isCursorLine: boolean; cursorOffset: number },
    lineIdx: number
  ) {
    const isFirst = line.lineIndex === 0 && lineIdx === 0;
    const prefix = isFirst ? "> " : "  ";
    const availableWidth = Math.max(0, contentWidth - prefix.length);
    const displayText = line.text.slice(0, availableWidth);

    // Empty input: render the prompt + fake cursor (and a placeholder hint when
    // idle) through the same pipeline so the box never collapses.
    if (isEmpty && isFirst) {
      return (
        <Box flexDirection="row" width={contentWidth} overflow="hidden">
          <Text color={YOU_COLOR} bold>{prefix}</Text>
          <Text inverse> </Text>
          {isIdle && (
            <Text color={MUTED_COLOR} dimColor>
              {"Ask fff to inspect, edit, debug, or build…"}
            </Text>
          )}
        </Box>
      );
    }

    // The fake cursor is always rendered (even while streaming) so the cursor
    // position never disappears mid-response.
    if (line.isCursorLine) {
      const beforeCursor = displayText.slice(0, line.cursorOffset);
      const rest = displayText.slice(line.cursorOffset);
      const atCursor = firstGrapheme(rest) ?? " ";
      const afterCursor = rest.slice(atCursor === " " && rest.length === 0 ? 0 : atCursor.length);

      return (
        <Box flexDirection="row" width={contentWidth} overflow="hidden">
          <Text color={isFirst ? YOU_COLOR : MUTED_COLOR} bold={isFirst}>{prefix}</Text>
          <Text color={TEXT_COLOR}>{beforeCursor}</Text>
          <Text inverse>{atCursor}</Text>
          <Text color={TEXT_COLOR}>{afterCursor}</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="row" width={contentWidth} overflow="hidden">
        <Text color={isFirst ? YOU_COLOR : MUTED_COLOR}>
          {prefix}
        </Text>
        <Text color={TEXT_COLOR}>{displayText}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={width} overflow="hidden">
      {/* Top border — labelled and accented so the prompt region is clearly
          separated from the transcript above it. */}
      <Box flexDirection="row" width={width} overflow="hidden">
        {scrollOffset > 0 ? (
          <>
            <Text color={PROMPT_ACCENT_COLOR}>{topBorder}</Text>
            <Text color={PROMPT_ACCENT_COLOR}>{"─".repeat(Math.max(0, width - topBorder.length))}</Text>
          </>
        ) : (
          <>
            <Text color={PROMPT_ACCENT_COLOR} bold>{LABEL}</Text>
            <Text color={PROMPT_ACCENT_COLOR}>{"─".repeat(Math.max(0, width - LABEL.length))}</Text>
          </>
        )}
      </Box>

      {/* Content lines — empty input flows through the same pipeline so the box
          never collapses. Height is the dynamic content height computed by App
          (grows with input up to a small cap) so the prompt stays compact. */}
      <Box flexDirection="column" width={width} height={maxVisibleLines} overflow="hidden">
        {visibleLines.map((line, idx) => (
          <Box key={idx} flexDirection="row" width={width} overflow="hidden">
            <Text>{" ".repeat(PADDING_X)}</Text>
            {renderLine(line, idx)}
          </Box>
        ))}
      </Box>

      {/* Bottom border */}
      <Box flexDirection="row" width={width} overflow="hidden">
        {linesBelow > 0 ? (
          <>
            <Text color={PROMPT_ACCENT_COLOR}>{bottomBorder}</Text>
            <Text color={PROMPT_ACCENT_COLOR}>{"─".repeat(Math.max(0, width - bottomBorder.length))}</Text>
          </>
        ) : (
          <Text color={PROMPT_ACCENT_COLOR}>{"─".repeat(width)}</Text>
        )}
      </Box>
    </Box>
  );
}
