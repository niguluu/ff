import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import { MODEL, type Message } from "../llm/llm";
import {
  ASSISTANT_COLOR,
  CONTEXT_BUDGET,
  MUTED_COLOR,
  SEPARATOR_COLOR,
  STATUS_BUSY_COLOR,
  STATUS_SUCCESS_COLOR,
  SYSTEM_PROMPT,
  TEXT_COLOR,
  YOU_COLOR,
} from "../core/config";
import { getVersion } from "../utils/version";
import { FillLines, padToWidth } from "./theme";
import { wrapInputToVisualLines } from "../utils/pi-prompt-utils";
import { estimateTokens } from "../core/conversation";
import {
  createSession,
  listSessions,
  saveSession,
  sessionLabel,
  type StoredSession,
} from "../core/session-store";
import { runAgent } from "../core/agent-runner";
import { useAlternateScreen } from "./use-alternate-screen";
import { shouldAutoScroll, buildViewportModel } from "./viewport";
import { MessageViewport } from "./message-viewport";
import { InputPanel } from "./input-panel";
import { useAppInput } from "../editor/use-app-input";
import { KillRing } from "../editor/kill-ring";
import { UndoStack } from "../editor/undo-stack";
import { PasteStore } from "../utils/paste";
import type { InputEditorState } from "../editor/input-editor";
import type { AppStatus } from "../core/types";

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

  const [termSize, setTermSize] = useState(() => [stdout.columns ?? 80, stdout.rows ?? 24]);
  const termCols = termSize[0]!;
  const termRows = termSize[1]!;

  useEffect(() => {
    function onResize() {
      setTermSize([stdout.columns || 80, stdout.rows || 24]);
    }
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  const showTips = messages.length === 0 && !isConnecting && !isStreaming;

  const promptMaxContentHeight = Math.min(8, Math.max(3, Math.floor(termRows * 0.2)));
  const promptContentWidth = Math.max(1, termCols - 2);
  const promptLineCount = Math.max(
    1,
    wrapInputToVisualLines(input, promptContentWidth).length
  );
  const promptContentHeight = Math.min(promptMaxContentHeight, promptLineCount);
  const inputHeight = promptContentHeight + 2;
  const statusHeight = 1;
  const dividerHeight = 1;
  const tipsHeight = showTips ? 1 : 0;
  const msgAreaHeight = Math.max(3, termRows - inputHeight - statusHeight - dividerHeight - tipsHeight);

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
    streamingRef.current = "";
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushNow();
    }, 32);
  }, [flushNow]);

  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
    setScrollLines((prev) => (shouldAutoScroll(prev) ? 0 : prev));
  }, []);

  const clearCopyFeedbackLater = useCallback(() => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyFeedback(""), 1500);
  }, []);

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
    promptMaxContentHeight,
    termCols,
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
      {showTips && (
        <Box flexDirection="row" width={termCols} flexShrink={0} justifyContent="flex-end">
          <Text color={MUTED_COLOR}>
            {"fff ready  "}
          </Text>
          <Text color={MUTED_COLOR}>
            {"type a prompt and press Enter  "}
          </Text>
          <Text color={MUTED_COLOR}>
            {"Shift+Enter newline • PgUp/PgDn scroll • Ctrl+O copy • Ctrl+/ undo  "}
          </Text>
          <Text color={MUTED_COLOR}>
            {".new start • .resume list"}
          </Text>
        </Box>
      )}

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

      <InputPanel
        input={input}
        cursorPos={cursorPos}
        width={termCols}
        maxVisibleLines={promptContentHeight}
        status={status}
      />

      <Box height={dividerHeight} width={termCols} overflow="hidden">
        <Text color={SEPARATOR_COLOR}>{"─".repeat(termCols)}</Text>
      </Box>

      <StatusBar
        width={termCols}
        height={statusHeight}
        status={status}
        statusLabel={statusLabel}
        model={MODEL}
        rounds={assistantCount}
        ctxLabel={ctxLabel}
        ctxColor={ctxColor}
        copyFeedback={copyFeedback}
        scroll={viewport.clampedScroll}
        hasMoreBelow={viewport.hasMoreBelow}
      />
    </Box>
  );
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

function StatusBar({
  width,
  height,
  status,
  statusLabel,
  model,
  rounds,
  ctxLabel,
  ctxColor,
  copyFeedback,
  scroll,
  hasMoreBelow,
}: {
  width: number;
  height: number;
  status: AppStatus;
  statusLabel: string;
  model: string;
  rounds: number;
  ctxLabel: string;
  ctxColor: string;
  copyFeedback: string;
  scroll: number;
  hasMoreBelow: boolean;
}) {
  const version = getVersion();
  const bullet = status === "thinking" ? "\u25cf" : "\u25cb";
  const left = `fff v${version} ${bullet} ${statusLabel}`;
  const centerLeft = `${model} | ${rounds} rounds | `;
  const center = centerLeft + ctxLabel;
  const copyPart = copyFeedback ? copyFeedback + " " : "";
  const scrollPart = scroll > 0 ? `scroll ${scroll} ` : "";
  const bottomPart = hasMoreBelow ? "\u2193bottom" : "";
  const right = copyPart + scrollPart + bottomPart;

  const remaining = Math.max(0, width - left.length - center.length - right.length);
  const gap1 = Math.floor(remaining / 2);
  const gap2 = remaining - gap1;

  return (
    <Box height={height} flexDirection="row" width={width} overflow="hidden">
      <Text color={status === "thinking" ? STATUS_BUSY_COLOR : STATUS_SUCCESS_COLOR}>
        {left}
      </Text>
      <Text>{" ".repeat(gap1)}</Text>
      <Text color={MUTED_COLOR}>{centerLeft}</Text>
      <Text color={ctxColor}>{ctxLabel}</Text>
      <Text>{" ".repeat(gap2)}</Text>
      {copyPart && <Text color={STATUS_SUCCESS_COLOR}>{copyPart}</Text>}
      {scrollPart && <Text color={STATUS_BUSY_COLOR}>{scrollPart}</Text>}
      {bottomPart && <Text color={MUTED_COLOR}>{bottomPart}</Text>}
    </Box>
  );
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
  const used = 2 + 1 + sessions.length;
  return (
    <Box flexDirection="column" justifyContent="flex-end" height={height} width={width} overflow="hidden">
      <FillLines count={Math.max(0, height - used)} width={width} />
      <Text color={YOU_COLOR} bold>{padToWidth("Recent sessions", width)}</Text>
      <Text color={MUTED_COLOR}>{padToWidth("type the number to resume, or .new for a fresh session", width)}</Text>
      <Text>{" ".repeat(width)}</Text>
      {sessions.map((session, index) => (
        <Box key={session.id} flexDirection="row" width={width} overflow="hidden">
          <Text color={ASSISTANT_COLOR} bold>{`${index + 1}. `}</Text>
          <Text color={TEXT_COLOR}>{padToWidth(sessionLabel(session), Math.max(0, width - String(index + 1).length - 2))}</Text>
        </Box>
      ))}
    </Box>
  );
}
