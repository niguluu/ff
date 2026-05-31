import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import { MODEL, type Message } from "./llm.js";
import {
  ASSISTANT_COLOR,
  CONTEXT_BUDGET,
  MUTED_COLOR,
  STATUS_BUSY_COLOR,
  STATUS_SUCCESS_COLOR,
  SYSTEM_PROMPT,
  TEXT_COLOR,
  YOU_COLOR,
} from "./config.js";
import { estimateTokens } from "./conversation.js";
import {
  createSession,
  listSessions,
  saveSession,
  sessionLabel,
  type StoredSession,
} from "./session-store.js";
import { runAgent } from "./agent-runner.js";
import { useAlternateScreen } from "./use-alternate-screen.js";
import { shouldAutoScroll, buildViewportModel } from "./viewport.js";
import { MessageViewport } from "./message-viewport.js";
import { InputPanel } from "./input-panel.js";
import { useAppInput } from "./use-app-input.js";
import { KillRing } from "./kill-ring.js";
import { UndoStack } from "./undo-stack.js";
import { PasteStore } from "./paste.js";
import type { InputEditorState } from "./input-editor.js";
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
  const [contextTokens, setContextTokens] = useState(0);
  const [sessionPicker, setSessionPicker] = useState<StoredSession[] | null>(null);

  const convRef = useRef<Message[]>([{ role: "system", content: SYSTEM_PROMPT }]);
  const sessionRef = useRef<StoredSession>(createSession(process.cwd()));
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const savedInputRef = useRef("");
  const killRingRef = useRef(new KillRing());
  const undoStackRef = useRef(new UndoStack<InputEditorState>());
  const pasteStoreRef = useRef(new PasteStore());
  const preferredColRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const streamingRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const termRows = stdout.rows || 24;
  const termCols = stdout.columns || 80;
  const promptMaxContentHeight = Math.max(5, Math.floor(termRows * 0.3));
  // Always reserve the maximum prompt height (content + 2 borders) like pi's
  // editor, so the message viewport keeps a stable height and does not jump as
  // the prompt grows/shrinks or while responses stream.
  const inputHeight = promptMaxContentHeight + 2;
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

  // Persist the active session whenever the visible transcript changes so a
  // crash or quit never loses work and `.resume` can reopen it.
  useEffect(() => {
    if (messages.length === 0) return;
    const session = sessionRef.current;
    session.messages = messages;
    session.conversation = convRef.current;
    session.updatedAt = new Date().toISOString();
    if (!session.title) {
      const firstUser = messages.find(
        (m) => m.role === "user" && !m.content.startsWith("__tool_result__")
      );
      if (firstUser) session.title = firstUser.content.replace(/\s+/g, " ").slice(0, 60);
    }
    saveSession(session);
  }, [messages]);

  const showFeedback = useCallback(
    (text: string) => {
      setCopyFeedback(text);
      clearCopyFeedbackLater();
    },
    [clearCopyFeedbackLater]
  );

  const startNewSession = useCallback(() => {
    setMessages([]);
    setStreamingText("");
    setScrollLines(0);
    setExpandedTools(new Set());
    convRef.current = [{ role: "system", content: SYSTEM_PROMPT }];
    sessionRef.current = createSession(process.cwd());
    setContextTokens(0);
    setSessionPicker(null);
    showFeedback("new session ✓");
  }, [showFeedback]);

  const loadSessionIntoState = useCallback((session: StoredSession) => {
    setMessages(session.messages);
    convRef.current =
      session.conversation.length > 0
        ? session.conversation
        : [{ role: "system", content: SYSTEM_PROMPT }];
    sessionRef.current = session;
    setContextTokens(estimateTokens(convRef.current));
    setScrollLines(0);
    setExpandedTools(new Set());
    setSessionPicker(null);
    showFeedback("resumed ✓");
  }, [showFeedback]);

  const handleSubmit = useCallback((text: string) => {
    const trimmed = text.trim();

    // Slash-style session commands are handled locally and never sent to the
    // model.
    if (trimmed === ".new") {
      startNewSession();
      return;
    }
    if (trimmed === ".resume" || trimmed.startsWith(".resume ")) {
      const arg = trimmed.slice(".resume".length).trim();
      const sessions = listSessions(10);
      if (arg.length > 0 && /^\d+$/.test(arg)) {
        const picked = sessions[Number(arg) - 1];
        if (picked) loadSessionIntoState(picked);
        else showFeedback("no such session");
        return;
      }
      if (sessions.length === 0) {
        showFeedback("no saved sessions");
        setSessionPicker(null);
        return;
      }
      setSessionPicker(sessions);
      return;
    }

    // While the picker is open a bare number selects a session.
    if (sessionPicker && /^\d+$/.test(trimmed)) {
      const picked = sessionPicker[Number(trimmed) - 1];
      if (picked) loadSessionIntoState(picked);
      else showFeedback("no such session");
      return;
    }
    setSessionPicker(null);

    void runAgent({
      conversation: convRef.current,
      userInput: text,
      onMessage: appendMessage,
      onConversationChange: (conversation) => {
        convRef.current = conversation;
        setContextTokens(estimateTokens(conversation));
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
  }, [appendMessage, scheduleFlush, sessionPicker, startNewSession, loadSessionIntoState, showFeedback]);

  useAppInput({
    exit,
    messages,
    input,
    cursorPos,
    status,
    msgAreaHeight,
    termCols,
    promptMaxContentHeight,
    historyRefs: {
      history: historyRef,
      historyIndex: historyIndexRef,
      savedInput: savedInputRef,
    },
    killRing: killRingRef.current,
    undoStack: undoStackRef.current,
    preferredColRef,
    pasteStore: pasteStoreRef.current,
    setInput,
    setCursorPos,
    setScrollLines,
    setExpandedTools,
    setCopyFeedback,
    clearCopyFeedbackLater,
    onSubmit: handleSubmit,
  });

  const assistantCount = messages.filter((message) => message.role === "assistant").length;

  // Context-used indicator. We can only estimate (no in-loop tokenizer), so
  // this is a guide, not an exact figure.
  const ctxPct = Math.min(100, Math.round((contextTokens / CONTEXT_BUDGET) * 100));
  const ctxColor =
    ctxPct >= 85 ? STATUS_BUSY_COLOR : ctxPct >= 60 ? ASSISTANT_COLOR : MUTED_COLOR;
  const ctxLabel = `~${formatTokens(contextTokens)}/${formatTokens(CONTEXT_BUDGET)} ctx ${ctxPct}%`;

  const statusLabel = isConnecting
    ? "connecting…"
    : status === "thinking"
      ? "working…"
      : "ready";

  return (
    <Box flexDirection="column" height={termRows} width={termCols} overflow="hidden">
      {sessionPicker ? (
        <SessionPicker
          sessions={sessionPicker}
          width={termCols}
          height={msgAreaHeight}
        />
      ) : (
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
      )}

      <InputPanel input={input} cursorPos={cursorPos} width={termCols} termRows={termRows} status={status} />

      <Box height={statusHeight} flexDirection="row" width={termCols} overflow="hidden">
        <Text color={status === "thinking" ? STATUS_BUSY_COLOR : STATUS_SUCCESS_COLOR}>
          {"fff "}
          {status === "thinking" ? "●" : "○"}
          {" " + statusLabel}
        </Text>
        <Box flexGrow={1} />
        <Text color={MUTED_COLOR} dimColor>{`${MODEL} | ${assistantCount} rounds | `}</Text>
        <Text color={ctxColor}>{ctxLabel}</Text>
        <Box flexGrow={1} />
        <Box flexDirection="row">
          {copyFeedback && <Text color={STATUS_SUCCESS_COLOR}>{copyFeedback + " "}</Text>}
          {viewport.clampedScroll > 0 && (
            <Text color={STATUS_BUSY_COLOR} dimColor>{`scroll ${viewport.clampedScroll} `}</Text>
          )}
          {viewport.hasMoreBelow && <Text color={MUTED_COLOR} dimColor>{"↓bottom"}</Text>}
        </Box>
      </Box>
    </Box>
  );
}

/** Compact token count, e.g. 1234 -> "1.2k". */
function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

function SessionPicker({
  sessions,
  width,
  height,
}: {
  sessions: StoredSession[];
  width: number;
  height: number;
}) {
  return (
    <Box flexDirection="column" justifyContent="flex-end" height={height} width={width} overflow="hidden">
      <Text color={YOU_COLOR} bold>{"Recent sessions"}</Text>
      <Text color={MUTED_COLOR} dimColor>{"type the number to resume, or .new for a fresh session"}</Text>
      <Box height={1} />
      {sessions.map((session, index) => (
        <Box key={session.id} flexDirection="row" width={width} overflow="hidden">
          <Text color={ASSISTANT_COLOR} bold>{`${index + 1}. `}</Text>
          <Text color={TEXT_COLOR}>{sessionLabel(session)}</Text>
        </Box>
      ))}
    </Box>
  );
}
