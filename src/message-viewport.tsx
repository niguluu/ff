import React from "react";
import { Box, Text } from "ink";
import type { Message } from "./llm.js";
import { ASSISTANT_COLOR, MUTED_COLOR, STATUS_BUSY_COLOR } from "./config.js";
import { wrapText } from "./message-format.js";

function getStreamingPreview(text: string, width: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return ["thinking…"];
  const maxPreviewWidth = Math.max(12, width - 14);
  const tail = compact.slice(-maxPreviewWidth);
  return [`thinking… ${tail}`];
}
import { MessageLine } from "./message-line.js";
import type { ViewportModel } from "./viewport.js";

type MessageViewportProps = {
  width: number;
  height: number;
  messages: Message[];
  viewport: ViewportModel;
  expandedTools: Set<number>;
  isConnecting: boolean;
  isStreaming: boolean;
  streamingText: string;
};

export function MessageViewport({
  width,
  height,
  messages,
  viewport,
  expandedTools,
  isConnecting,
  isStreaming,
  streamingText,
}: MessageViewportProps) {
  const { visibleMessages, visibleStart, hasMoreAbove, hasMoreBelow, clampedScroll, maxScroll } =
    viewport;
  const linesAbove = Math.max(0, maxScroll - clampedScroll);
  const streamingLines = isStreaming ? getStreamingPreview(streamingText, width) : [];
  const isEmpty = messages.length === 0 && !isConnecting && !isStreaming;

  return (
    <Box
      flexDirection="column"
      justifyContent="flex-end"
      height={height}
      width={width}
      overflow="hidden"
    >
      {isEmpty && (
        <Box flexDirection="column">
          <Text color={MUTED_COLOR} dimColor>
            {"fff ready"}
          </Text>
          <Text color={MUTED_COLOR} dimColor>
            {"type a prompt and press Enter"}
          </Text>
          <Text color={MUTED_COLOR} dimColor>
            {"Shift+Enter newline • PgUp/PgDn scroll • Ctrl+O copy • Ctrl+/ undo"}
          </Text>
          <Text color={MUTED_COLOR} dimColor>
            {".new start a session • .resume list recent sessions"}
          </Text>
        </Box>
      )}

      {!isEmpty && hasMoreAbove && (
        <Box flexDirection="row" height={1}>
          <Text color={MUTED_COLOR} dimColor>{`↑ ${linesAbove}`}</Text>
        </Box>
      )}

      {visibleMessages.map((message, index) => (
        <Box
          key={visibleStart + index}
          flexDirection="column"
          width={width}
          overflow="hidden"
        >
          <MessageLine
            msg={message}
            width={width}
            index={visibleStart + index}
            isExpanded={expandedTools.has(visibleStart + index)}
          />
        </Box>
      ))}

      {isConnecting && clampedScroll === 0 && !isStreaming && (
        <Box flexDirection="row" width={width} overflow="hidden">
          <Text color={ASSISTANT_COLOR} dimColor>{"..."}</Text>
        </Box>
      )}

      {isStreaming && clampedScroll === 0 && (
        <Box flexDirection="column" width={width} overflow="hidden">
          {streamingLines.map((line, index) => (
            <Box key={index} flexDirection="row">
              <Text color={ASSISTANT_COLOR} dimColor>{line}</Text>
              {index === streamingLines.length - 1 && <Text inverse>{" "}</Text>}
            </Box>
          ))}
        </Box>
      )}

      {isStreaming && clampedScroll > 0 && (
        <Box flexDirection="row" height={1}>
          <Text color={STATUS_BUSY_COLOR} dimColor>{"↓ streaming..."}</Text>
        </Box>
      )}

      {!isEmpty && hasMoreBelow && (
        <Box flexDirection="row" height={1}>
          <Text color={MUTED_COLOR} dimColor>{`↓ ${clampedScroll}`}</Text>
        </Box>
      )}
    </Box>
  );
}
