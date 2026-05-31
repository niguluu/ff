import type { Message } from "./llm.js";
import { wrapText } from "./message-format.js";
import { getMessageHeight } from "./message-line.js";

export type ViewportModel = {
  messageHeights: number[];
  totalContentLines: number;
  maxScroll: number;
  clampedScroll: number;
  visibleStart: number;
  visibleMessages: Message[];
  hasMoreAbove: boolean;
  hasMoreBelow: boolean;
  streamingHeight: number;
};

export function buildViewportModel(args: {
  messages: Message[];
  termCols: number;
  msgAreaHeight: number;
  expandedTools: Set<number>;
  scrollLines: number;
  isStreaming: boolean;
  streamingText: string;
}): ViewportModel {
  const {
    messages,
    termCols,
    msgAreaHeight,
    expandedTools,
    scrollLines,
    isStreaming,
    streamingText,
  } = args;

  const messageHeights = messages.map((message, index) =>
    getMessageHeight(message, termCols, expandedTools, index)
  );
  const streamingHeight = isStreaming ? Math.max(1, wrapText(streamingText, termCols).length) : 0;
  const totalContentLines = messageHeights.reduce((sum, value) => sum + value, 0) + streamingHeight;
  const maxScroll = Math.max(0, totalContentLines - msgAreaHeight);
  const clampedScroll = Math.min(scrollLines, maxScroll);

  const targetLines = msgAreaHeight + clampedScroll;
  let consumedLines = streamingHeight;
  let visibleStart = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    consumedLines += messageHeights[i] ?? 0;
    if (consumedLines >= targetLines) {
      visibleStart = i;
      break;
    }
  }

  return {
    messageHeights,
    totalContentLines,
    maxScroll,
    clampedScroll,
    visibleStart,
    visibleMessages: messages.slice(visibleStart),
    hasMoreAbove: clampedScroll < maxScroll,
    hasMoreBelow: clampedScroll > 0,
    streamingHeight,
  };
}

export function shouldAutoScroll(scrollLines: number) {
  return scrollLines <= 1;
}
