import React from "react";
import { Box, Text } from "ink";
import { THEME_BG } from "./config.js";

/**
 * Pad a plain-text line with trailing spaces so it spans exactly `width`
 * columns. Ink only paints `backgroundColor` under the characters a <Text>
 * actually renders, so to make the Gruvbox background span a full row we must
 * pad the content to the terminal width. Strings here are plain (no embedded
 * ANSI — Ink handles styling via props), so a simple length check is fine.
 */
export function padToWidth(line: string, width: number): string {
  if (width <= 0) return "";
  const chars = [...line];
  // Truncate over-width content so a single logical line never wraps onto extra
  // physical rows. Without this, long tool lines (e.g. a `run_command` summary
  // with a big command) overflowed the terminal width and wrapped, while the
  // viewport's height accounting assumed a single row — leaving stale, bleeding
  // text on screen. Clamping every themed line to exactly `width` keeps each
  // tool (and its sub-tool result) on one line.
  if (chars.length > width) return chars.slice(0, width).join("");
  if (chars.length === width) return line;
  return line + " ".repeat(width - chars.length);
}

/**
 * A column of blank, full-width, themed rows used to fill otherwise-empty
 * vertical space so the background paints the entire screen (not just the
 * rows that happen to contain text). This is what makes the theme look
 * "absolute" even on terminals that ignore the OSC 11 default-background escape.
 */
export function FillLines({ count, width }: { count: number; width: number }) {
  if (count <= 0) return null;
  const blank = " ".repeat(Math.max(0, width));
  return (
    <Box flexDirection="column" width={width} flexShrink={0}>
      {Array.from({ length: count }, (_, i) => (
        <Text key={i} backgroundColor={THEME_BG}>
          {blank}
        </Text>
      ))}
    </Box>
  );
}
