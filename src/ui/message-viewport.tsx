import React from "react";
import { Box, Text } from "ink";
import type { Message } from "../llm/llm";
import { ASSISTANT_COLOR, MUTED_COLOR, STATUS_BUSY_COLOR } from "../core/config";
import { FillLines, padToWidth } from "./theme";

function getStreamingPreview() {
  return ["thinking…"];
}
import { MessageLine } from "./message-line";
import type { ViewportModel } from "./viewport";

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
  const streamingLines = isStreaming ? getStreamingPreview() : [];
  const hasMessages = messages.length > 0 || isConnecting || isStreaming;

  const visibleMessageLines = viewport.messageHeights
    .slice(viewport.visibleStart)
    .reduce((sum, value) => sum + value, 0);
  let usedLines = visibleMessageLines;
  if (hasMessages && hasMoreAbove) usedLines += 1;
  if (isConnecting && clampedScroll === 0 && !isStreaming) usedLines += 1;
  if (isStreaming && clampedScroll === 0) usedLines += streamingLines.length;
  if (isStreaming && clampedScroll > 0) usedLines += 1;
  if (hasMessages && hasMoreBelow) usedLines += 1;
  const fillCount = Math.max(0, height - usedLines);

  return (
    <Box
      flexDirection="column"
      justifyContent="flex-end"
      height={height}
      width={width}
      overflow="hidden"
    >
      {hasMessages && hasMoreAbove && (
        <Box flexDirection="row" height={1}>
          <Text color={MUTED_COLOR}>{padToWidth(`↑ ${linesAbove}`, width)}</Text>
        </Box>
      )}

      {visibleMessages.map((message, index) => {
        const absoluteIndex = visibleStart + index;
        // Skip messages that render nothing (e.g. collapsed tool results) so no
        // blank row is emitted between consecutive tool-call lines.
        if ((viewport.messageHeights[absoluteIndex] ?? 0) === 0) return null;
        return (
          <Box
            key={absoluteIndex}
            flexDirection="column"
            width={width}
            overflow="hidden"
          >
            <MessageLine
              msg={message}
              width={width}
              index={absoluteIndex}
              isExpanded={expandedTools.has(absoluteIndex)}
              messages={messages}
            />
          </Box>
        );
      })}

      {isConnecting && clampedScroll === 0 && !isStreaming && (
        <Box flexDirection="row" width={width} overflow="hidden">
          <Text color={ASSISTANT_COLOR}>{padToWidth("...", width)}</Text>
        </Box>
      )}

      {isStreaming && clampedScroll === 0 && (
        <Box flexDirection="column" width={width} overflow="hidden">
          {streamingLines.map((line, index) => (
            <Box key={index} flexDirection="row">
              <Text color={ASSISTANT_COLOR}>{padToWidth(line + " ", width)}</Text>
            </Box>
          ))}
        </Box>
      )}

      {isStreaming && clampedScroll > 0 && (
        <Box flexDirection="row" height={1}>
          <Text color={STATUS_BUSY_COLOR}>{padToWidth("↓ streaming...", width)}</Text>
        </Box>
      )}

      {hasMessages && hasMoreBelow && (
        <Box flexDirection="row" height={1}>
          <Text color={MUTED_COLOR}>{padToWidth(`↓ ${clampedScroll}`, width)}</Text>
        </Box>
      )}

      {/* Fill rendered last so content sits at the top of the viewport when it
          fits, while overflow still clips the oldest lines (flex-end). */}
      <FillLines count={fillCount} width={width} />
    </Box>
  );
}
