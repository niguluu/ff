import React, { useCallback, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import { MODEL, type Message } from "./llm.js";
import {
  MUTED_COLOR,
  STATUS_BUSY_COLOR,
  STATUS_SUCCESS_COLOR,
  SYSTEM_PROMPT,
} from "./config.js";
import { runAgent } from "./agent-runner.js";
import { useAlternateScreen } from "./use-alternate-screen.js";
import { shouldAutoScroll, buildViewportModel } from "./viewport.js";
import { MessageViewport } from "./message-viewport.js";
import { InputPanel } from "./input-panel.js";
import { useAppInput } from "./use-app-input.js";
import type { AppStatus } from "./types.js";

export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  useAlternateScreen();

  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<AppStatus>("idle");
  const [scrollLines, setScrollLines] = useState(0);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState("");
  const [cursorPos, setCursorPos] = useState(0);

  const convRef = useRef<Message[]>([{ role: "system", content: SYSTEM_PROMPT }]);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const savedInputRef = useRef("");
  const activeRef = useRef(false);
  const streamingRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const termRows = stdout.rows || 24;
  const termCols = stdout.columns || 80;
  const inputHeight = input.split("\n").length;
  const statusHeight = 1;
  const msgAreaHeight = Math.max(3, termRows - inputHeight - statusHeight);

  const viewport = useMemo(
    () =>
      buildViewportModel({
        messages,
        termCols,
        msgAreaHeight,
        expandedTools,
        scrollLines,
        isStreaming,
        streamingText,
      }),
    [messages, termCols, msgAreaHeight, expandedTools, scrollLines, isStreaming, streamingText]
  );

  const flushNow = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const chunk = streamingRef.current;
    if (!chunk) return;
    streamingRef.current = "";
    setStreamingText((prev) => prev + chunk);
    setScrollLines((prev) => (shouldAutoScroll(prev) ? 0 : prev));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushNow();
    }, 32);
  }, [flushNow]);

  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const clearCopyFeedbackLater = useCallback(() => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyFeedback(""), 1500);
  }, []);

  const handleSubmit = useCallback((text: string) => {
    void runAgent({
      conversation: convRef.current,
      userInput: text,
      onMessage: appendMessage,
      onConversationChange: (conversation) => {
        convRef.current = conversation;
      },
      onStatusChange: setStatus,
      onConnectingChange: setIsConnecting,
      onStreamingChange: setIsStreaming,
      onStreamingTextChange: setStreamingText,
      appendStreamingText: (chunk) => {
        setStreamingText((prev) => prev + chunk);
        setScrollLines((prev) => (shouldAutoScroll(prev) ? 0 : prev));
      },
      onAutoScroll: () => {
        setScrollLines((prev) => (shouldAutoScroll(prev) ? 0 : prev));
      },
      streamingRef,
      flushTimerRef,
      isActiveRef: activeRef,
      scheduleFlush,
      flushNow,
    });
  }, [appendMessage, scheduleFlush]);

  useAppInput({
    exit,
    messages,
    input,
    cursorPos,
    status,
    msgAreaHeight,
    historyRefs: {
      history: historyRef,
      historyIndex: historyIndexRef,
      savedInput: savedInputRef,
    },
    setInput,
    setCursorPos,
    setScrollLines,
    setExpandedTools,
    setCopyFeedback,
    clearCopyFeedbackLater,
    onSubmit: handleSubmit,
  });

  const assistantCount = messages.filter((message) => message.role === "assistant").length;

  return (
    <Box flexDirection="column" height={termRows} width={termCols} overflow="hidden">
      <MessageViewport
        width={termCols}
        height={msgAreaHeight}
        messages={messages}
        viewport={viewport}
        expandedTools={expandedTools}
        isConnecting={isConnecting}
        isStreaming={isStreaming}
        streamingText={streamingText}
      />

      <InputPanel input={input} cursorPos={cursorPos} width={termCols} status={status} />

      <Box height={statusHeight} flexDirection="row" width={termCols} overflow="hidden">
        <Text color={MUTED_COLOR} dimColor>
          {"fff"}
          {status === "thinking" ? " ●" : " ○"}
        </Text>
        <Box flexGrow={1} />
        <Text color={MUTED_COLOR} dimColor>{`${MODEL} | ${process.cwd()} | ${assistantCount} rounds`}</Text>
        <Box flexGrow={1} />
        <Box flexDirection="row">
          {copyFeedback && <Text color={STATUS_SUCCESS_COLOR} dimColor>{copyFeedback + " "}</Text>}
          {viewport.clampedScroll > 0 && (
            <Text color={STATUS_BUSY_COLOR} dimColor>{`scroll ${viewport.clampedScroll} `}</Text>
          )}
          {viewport.hasMoreBelow && <Text color={MUTED_COLOR} dimColor>{"↓bottom"}</Text>}
        </Box>
      </Box>
    </Box>
  );
}
