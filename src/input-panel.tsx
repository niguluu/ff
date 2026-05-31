import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { MUTED_COLOR, TEXT_COLOR, THEME_BG, YOU_COLOR } from "./config.js";
import { wrapInputToVisualLines } from "./pi-prompt-utils.js";
import { firstGrapheme } from "./text-segmentation.js";
import { FillLines } from "./theme.js";


type InputPanelProps = {
  input: string;
  cursorPos: number;
  width: number;
  /** Number of content rows reserved for the prompt (computed by App). */
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

  // Each rendered prompt row is painted full-width with the theme background
  // (leading PADDING_X + prefix + body + trailing filler) so the Gruvbox color
  // covers the whole prompt box on every terminal, not just under the glyphs.
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

    // Empty input: render the prompt + fake cursor (and a placeholder hint when
    // idle) through the same pipeline so the box never collapses.
    if (isEmpty && isFirst) {
      const hint = isIdle ? "Ask fff to inspect, edit, debug, or build…" : "";
      return (
        <Box flexDirection="row" width={width} overflow="hidden">
          <Text backgroundColor={THEME_BG}>{leading}</Text>
          <Text color={YOU_COLOR} bold backgroundColor={THEME_BG}>{prefix}</Text>
          <Text inverse>{" "}</Text>
          {isIdle && (
            <Text color={MUTED_COLOR} backgroundColor={THEME_BG}>
              {hint}
            </Text>
          )}
          <Text backgroundColor={THEME_BG}>{fill(1 + hint.length)}</Text>
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
        <Box flexDirection="row" width={width} overflow="hidden">
          <Text backgroundColor={THEME_BG}>{leading}</Text>
          <Text color={isFirst ? YOU_COLOR : MUTED_COLOR} bold={isFirst} backgroundColor={THEME_BG}>{prefix}</Text>
          <Text color={TEXT_COLOR} backgroundColor={THEME_BG}>{beforeCursor}</Text>
          <Text inverse>{atCursor}</Text>
          <Text color={TEXT_COLOR} backgroundColor={THEME_BG}>{afterCursor}</Text>
          <Text backgroundColor={THEME_BG}>{fill(beforeCursor.length + 1 + afterCursor.length)}</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="row" width={width} overflow="hidden">
        <Text backgroundColor={THEME_BG}>{leading}</Text>
        <Text color={isFirst ? YOU_COLOR : MUTED_COLOR} backgroundColor={THEME_BG}>
          {prefix}
        </Text>
        <Text color={TEXT_COLOR} backgroundColor={THEME_BG}>{displayText}</Text>
        <Text backgroundColor={THEME_BG}>{fill(displayText.length)}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={width} overflow="hidden">
      {/* Content lines — empty input flows through the same pipeline so the box
          never collapses. Height is the dynamic content height computed by App
          (grows with input up to a small cap) so the prompt stays compact. */}
      <Box flexDirection="column" width={width} height={maxVisibleLines} overflow="hidden">
        {visibleLines.map((line, idx) => (
          <Box key={idx} flexDirection="row" width={width} overflow="hidden">
            {renderLine(line, idx)}
          </Box>
        ))}
        {/* Pad any unused prompt rows so the themed background fills the whole
            (fixed-height) content box rather than leaving raw terminal rows. */}
        <FillLines count={Math.max(0, maxVisibleLines - visibleLines.length)} width={width} />
      </Box>
    </Box>
  );
}
