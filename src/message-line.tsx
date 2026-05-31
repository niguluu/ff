import React from "react";
import { Box, Text } from "ink";
import { extractToolInvocations, type Message } from "./llm.js";
import {
  ASSISTANT_COLOR,
  ERROR_COLOR,
  MUTED_COLOR,
  TEXT_COLOR,
  TOOL_COLOR,
  TOOL_ERROR_COLOR,
  TOOL_LIST_COLOR,
  TOOL_READ_COLOR,
  TOOL_WRITE_COLOR,
  YOU_COLOR,
} from "./config.js";
import {
  formatToolCallArgs,
  parseSegments,
  parseToolDisplay,
  summarizeToolDisplay,
  wrapText,
} from "./message-format.js";

export function getMessageHeight(
  message: Message,
  width: number,
  expandedSet: Set<number>,
  index: number
): number {
  const toolDisplay = parseToolDisplay(message.content);
  const isParseError = message.content.startsWith("tool_parse_error:");

  if (toolDisplay) {
    if (!expandedSet.has(index)) return 1;
    return 1 + wrapText(JSON.stringify(toolDisplay.result, null, 2), width).length;
  }

  if (isParseError) {
    return wrapText(message.content, width).length;
  }

  if (message.role === "assistant") {
    const { invocations } = extractToolInvocations(message.content);
    if (invocations.length > 0) return invocations.length;
    return parseSegments(message.content).reduce((total, segment) => {
      const segmentWidth = segment.type === "text" ? width : Math.max(1, width - 2);
      const lines = wrapText(segment.content, segmentWidth).length || 1;
      return total + (segment.type === "thinking" ? lines + 1 : lines);
    }, 0);
  }

  return wrapText(message.content, width).length || 1;
}

type MessageLineProps = {
  msg: Message;
  width: number;
  index: number;
  isExpanded: boolean;
};

function getToolAccent(name: string, result?: any) {
  if (result?.error) return TOOL_ERROR_COLOR;
  switch (name) {
    case "read_file":
      return TOOL_READ_COLOR;
    case "list_files":
      return TOOL_LIST_COLOR;
    case "edit_file":
    case "atomic_overwrite":
      return TOOL_WRITE_COLOR;
    default:
      return TOOL_COLOR;
  }
}

export function MessageLine({ msg, width, isExpanded }: MessageLineProps) {
  const toolDisplay = parseToolDisplay(msg.content);
  const isParseError = msg.content.startsWith("tool_parse_error:");

  if (msg.role === "user" && !toolDisplay && !isParseError) {
    const lines = wrapText(msg.content, width);
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Text key={i} color={YOU_COLOR}>
            {line}
          </Text>
        ))}
      </Box>
    );
  }

  if (msg.role === "assistant") {
    const { invocations } = extractToolInvocations(msg.content);
    if (invocations.length > 0) {
      return (
        <Box flexDirection="column">
          {invocations.map((invocation, i) => {
            const accent = getToolAccent(invocation.name);
            return (
              <Box key={i} flexDirection="row">
                <Text color={accent} bold>{"→ "}</Text>
                <Text color={accent} bold>{invocation.name}</Text>
                <Text color={TOOL_COLOR}>{" " + formatToolCallArgs(invocation)}</Text>
              </Box>
            );
          })}
        </Box>
      );
    }

    if (!msg.content) {
      return (
        <Text color={ASSISTANT_COLOR} dimColor>
          Thinking...
        </Text>
      );
    }

    const segments = parseSegments(msg.content);
    return (
      <Box flexDirection="column">
        {segments.map((segment, i) => {
          if (segment.type === "text") {
            const lines = wrapText(segment.content, width);
            return lines.map((line, j) => (
              <Text key={`${i}-${j}`} color={ASSISTANT_COLOR}>
                {line}
              </Text>
            ));
          }

          if (segment.type === "thinking") {
            const lines = wrapText(segment.content, width - 2);
            return (
              <Box key={i} flexDirection="column" paddingX={1}>
                <Text color={MUTED_COLOR} dimColor>
                  {"[thinking]"}
                </Text>
                {lines.map((line, j) => (
                  <Text key={`${i}-${j}`} color={MUTED_COLOR} dimColor>
                    {line || " "}
                  </Text>
                ))}
              </Box>
            );
          }

          const lines = wrapText(segment.content, width - 2);
          return (
            <Box key={i} flexDirection="column" paddingX={1}>
              {lines.map((line, j) => (
                <Text key={`${i}-${j}`} color={TEXT_COLOR} dimColor>
                  {line || " "}
                </Text>
              ))}
            </Box>
          );
        })}
      </Box>
    );
  }

  if (toolDisplay) {
    const accent = getToolAccent(toolDisplay.name, toolDisplay.result);
    if (isExpanded) {
      const raw = JSON.stringify(toolDisplay.result, null, 2);
      const lines = wrapText(raw, width);
      return (
        <Box flexDirection="column">
          <Text color={accent} bold>{`▾ ${toolDisplay.name}`}</Text>
          {lines.map((line, i) => (
            <Text key={i} color={TOOL_COLOR}>
              {line}
            </Text>
          ))}
        </Box>
      );
    }

    const summary = summarizeToolDisplay(toolDisplay.name, toolDisplay.result);
    return <Text color={accent}>{`▸ ${summary}`}</Text>;
  }

  if (isParseError) {
    return (
      <Text color={ERROR_COLOR}>
        {"Parse Error: " + msg.content.slice("tool_parse_error: ".length)}
      </Text>
    );
  }

  return null;
}
