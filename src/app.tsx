import { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { spawn } from "child_process";
import {
  readFileTool,
  listFilesTool,
  editFileTool,
  atomicOverwriteTool,
} from "./tools.js";
import {
  executeLLMCall,
  extractToolInvocations,
  getSystemPrompt,
  MODEL,
  type Message,
} from "./llm.js";

const TOOL_REGISTRY = {
  read_file: readFileTool,
  list_files: listFilesTool,
  edit_file: editFileTool,
  atomic_overwrite: atomicOverwriteTool,
} as const;

type ToolName = keyof typeof TOOL_REGISTRY;

interface ReadFileArgs {
  filename?: string;
  limit?: number;
}
interface ListFilesArgs {
  path?: string;
}
interface EditFileArgs {
  path?: string;
  old_str?: string;
  new_str?: string;
}
interface AtomicOverwriteArgs {
  filename?: string;
  new_content?: string;
  newContent?: string;
}

const TOOL_ARG_PARSERS: Record<ToolName, (args: unknown) => unknown[]> = {
  read_file: (args) => {
    if (typeof args === "string") return [args];
    const a = args as ReadFileArgs;
    const filename = a.filename ?? ".";
    const limit = a.limit;
    return limit !== undefined ? [filename, limit] : [filename];
  },
  list_files: (args) => {
    if (typeof args === "string") return [args];
    const a = args as ListFilesArgs;
    return [a.path ?? "."];
  },
  edit_file: (args) => {
    if (typeof args === "string")
      throw new Error("edit_file requires an object with path, old_str, new_str");
    const a = args as EditFileArgs;
    return [a.path ?? ".", a.old_str ?? "", a.new_str ?? ""];
  },
  atomic_overwrite: (args) => {
    if (typeof args === "string")
      throw new Error(
        "atomic_overwrite requires an object with filename, new_content"
      );
    const a = args as AtomicOverwriteArgs;
    return [a.filename ?? ".", a.new_content ?? a.newContent ?? ""];
  },
};

const SYSTEM_PROMPT = getSystemPrompt();
const YOU_COLOR = "blue";
const ASSISTANT_COLOR = "yellow";
const TOOL_COLOR = "gray";
const ERROR_COLOR = "red";

const MAX_TOOL_ROUNDS = Number(process.env.MAX_TOOL_ROUNDS ?? "100");
const MAX_CONVERSATION_MESSAGES = Number(
  process.env.MAX_CONVERSATION_MESSAGES ?? "40"
);

function pruneMessages(conv: Message[]): Message[] {
  const system = conv.find((m) => m.role === "system");
  const rest = conv.filter((m) => m.role !== "system");
  if (rest.length <= MAX_CONVERSATION_MESSAGES) return conv;
  const pruned = rest.slice(-MAX_CONVERSATION_MESSAGES);
  return system ? [system, ...pruned] : pruned;
}

/* ------------------------------------------------------------------ */
/*  Word wrap                                                          */
/* ------------------------------------------------------------------ */

function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.length <= maxWidth) {
      lines.push(rawLine);
    } else {
      for (let i = 0; i < rawLine.length; i += maxWidth) {
        lines.push(rawLine.slice(i, i + maxWidth));
      }
    }
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Content segment parser                                             */
/* ------------------------------------------------------------------ */

type Segment = { type: "text" | "code" | "thinking"; content: string };

function parseCodeBlocks(text: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /```([\s\S]*?)```/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ type: "text", content: text.slice(lastIdx, match.index) });
    }
    let code = match[1] ?? "";
    const firstNl = code.indexOf("\n");
    if (firstNl !== -1 && !code.slice(0, firstNl).includes(" ")) {
      code = code.slice(firstNl + 1);
    }
    segments.push({ type: "code", content: code });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    segments.push({ type: "text", content: text.slice(lastIdx) });
  }
  return segments;
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = thinkRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      segments.push(...parseCodeBlocks(text.slice(lastIdx, match.index)));
    }
    segments.push({ type: "thinking", content: match[1] ?? "" });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    segments.push(...parseCodeBlocks(text.slice(lastIdx)));
  }
  if (segments.length === 0) {
    segments.push({ type: "text", content: text });
  }
  return segments;
}

/* ------------------------------------------------------------------ */
/*  Tool display helpers                                               */
/* ------------------------------------------------------------------ */

function formatToolResultForDisplay(name: string, result: unknown): string {
  return `__tool_result__:${name}:${JSON.stringify(result)}`;
}

function parseToolDisplay(
  content: string
): { name: string; result: unknown } | null {
  if (!content.startsWith("__tool_result__:")) return null;
  const rest = content.slice("__tool_result__:".length);
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) return null;
  const name = rest.slice(0, colonIdx);
  const jsonStr = rest.slice(colonIdx + 1);
  try {
    return { name, result: JSON.parse(jsonStr) };
  } catch {
    return null;
  }
}

function summarizeToolDisplay(name: string, result: any): string {
  if (result?.error) return `❌ ${name}: ${result.error}`;
  switch (name) {
    case "read_file": {
      const path = result.file_path ?? "unknown";
      if (result.truncated)
        return `📄 read: ${path} (${result.total_lines} lines, truncated)`;
      return `📄 read: ${path}`;
    }
    case "list_files": {
      const path = result.path ?? "unknown";
      const count = result.files?.length ?? 0;
      return `📁 list: ${path} (${count} items)`;
    }
    case "edit_file": {
      const path = result.path ?? "unknown";
      const action = result.action ?? "done";
      return `✏️ edit: ${path} (${action})`;
    }
    case "atomic_overwrite": {
      const action = result.action ?? "";
      const m = action.match(/Atomically overwrote entire file: (.+)/);
      const path = m ? m[1] : "unknown";
      return `💾 write: ${path}`;
    }
    default:
      return `🔧 ${name}`;
  }
}

function formatToolCallArgs(inv: { name: string; args: unknown }): string {
  const a = inv.args as any;
  switch (inv.name) {
    case "read_file":
      return typeof a === "string" ? a : a?.filename ?? "";
    case "list_files":
      return typeof a === "string" ? a : a?.path ?? "";
    case "edit_file":
      return a?.path ?? "";
    case "atomic_overwrite":
      return a?.filename ?? "";
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Message height estimator                                           */
/* ------------------------------------------------------------------ */

function getMessageHeight(
  msg: Message,
  width: number,
  expandedSet: Set<number>,
  index: number
): number {
  const toolDisplay = parseToolDisplay(msg.content);
  if (toolDisplay) {
    if (expandedSet.has(index)) {
      return (
        wrapText(JSON.stringify(toolDisplay.result, null, 2), width).length || 1
      );
    }
    return 1;
  }
  if (msg.content.startsWith("tool_parse_error:")) return 1;
  if (msg.role === "user") return wrapText(msg.content, width).length || 1;

  if (msg.role === "assistant") {
    const { invocations } = extractToolInvocations(msg.content);
    if (invocations.length > 0) return invocations.length;
    const segments = parseSegments(msg.content);
    let h = 0;
    for (const seg of segments) {
      if (seg.type === "text") h += wrapText(seg.content, width).length || 1;
      else if (seg.type === "thinking")
        h += 1 + (wrapText(seg.content, width - 2).length || 1);
      else if (seg.type === "code")
        h += wrapText(seg.content, width - 2).length || 1;
    }
    return h || 1;
  }
  return 1;
}

/* ------------------------------------------------------------------ */
/*  Clipboard helper                                                   */
/* ------------------------------------------------------------------ */

function copyToClipboard(text: string) {
  const platform = process.platform;
  let cmd: string;
  let args: string[];
  if (platform === "darwin") {
    cmd = "pbcopy";
    args = [];
  } else if (platform === "win32") {
    cmd = "clip";
    args = [];
  } else {
    if (process.env.WAYLAND_DISPLAY) {
      cmd = "wl-copy";
      args = [];
    } else {
      cmd = "xclip";
      args = ["-selection", "clipboard"];
    }
  }
  const proc = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
  proc.stdin.write(text, "utf-8");
  proc.stdin.end();
  proc.on("error", () => {
    /* silent fail */
  });
}

/* ------------------------------------------------------------------ */
/*  Message renderer                                                   */
/* ------------------------------------------------------------------ */

function MessageLine({
  msg,
  width,
  index,
  isExpanded,
}: {
  msg: Message;
  width: number;
  index: number;
  isExpanded: boolean;
}) {
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
          {invocations.map((inv, j) => (
            <Box key={j} flexDirection="row">
              <Text color={ASSISTANT_COLOR} bold>{"→ "}</Text>
              <Text color={ASSISTANT_COLOR}>{inv.name}</Text>
              <Text color={TOOL_COLOR}>{" " + formatToolCallArgs(inv)}</Text>
            </Box>
          ))}
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
        {segments.map((seg, i) => {
          if (seg.type === "text") {
            const lines = wrapText(seg.content, width);
            return lines.map((line, j) => (
              <Text key={`${i}-${j}`} color={ASSISTANT_COLOR}>
                {line}
              </Text>
            ));
          }
          if (seg.type === "thinking") {
            const lines = wrapText(seg.content, width - 2);
            return (
              <Box key={i} flexDirection="column" paddingX={1}>
                <Text color="gray" dimColor>
                  {"[thinking]"}
                </Text>
                {lines.map((line, j) => (
                  <Text key={`${i}-${j}`} color="gray" dimColor>
                    {line || " "}
                  </Text>
                ))}
              </Box>
            );
          }
          if (seg.type === "code") {
            const lines = wrapText(seg.content, width - 2);
            return (
              <Box
                key={i}
                flexDirection="column"
                paddingX={1}
                backgroundColor="gray"
              >
                {lines.map((line, j) => (
                  <Text key={`${i}-${j}`} color="white" dimColor>
                    {line || " "}
                  </Text>
                ))}
              </Box>
            );
          }
          return null;
        })}
      </Box>
    );
  }

  if (toolDisplay) {
    if (isExpanded) {
      const raw = JSON.stringify(toolDisplay.result, null, 2);
      const lines = wrapText(raw, width);
      return (
        <Box flexDirection="column">
          <Text color={TOOL_COLOR} bold>{`▾ ${toolDisplay.name}`}</Text>
          {lines.map((line, i) => (
            <Text key={i} color={TOOL_COLOR}>
              {line}
            </Text>
          ))}
        </Box>
      );
    }
    const summary = summarizeToolDisplay(toolDisplay.name, toolDisplay.result);
    return <Text color={TOOL_COLOR}>{`▸ ${summary}`}</Text>;
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

/* ------------------------------------------------------------------ */
/*  Alternate screen buffer                                            */
/* ------------------------------------------------------------------ */

function useAlternateScreen() {
  useEffect(() => {
    if (!process.stdout.isTTY) return;

    const enter = () => process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H");
    const exit = () => process.stdout.write("\x1b[?1049l");

    enter();

    const onSig = () => {
      exit();
      process.exit();
    };
    process.on("SIGINT", onSig);
    process.on("SIGTERM", onSig);

    return () => {
      process.off("SIGINT", onSig);
      process.off("SIGTERM", onSig);
      exit();
    };
  }, []);
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  useAlternateScreen();

  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "thinking">("idle");
  const [scrollLines, setScrollLines] = useState(0);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState("");
  const [cursorPos, setCursorPos] = useState(0);

  const convRef = useRef<Message[]>([
    { role: "system", content: SYSTEM_PROMPT },
  ]);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const savedInputRef = useRef<string>("");
  const activeRef = useRef(false);
  const streamingRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const termRows = stdout.rows || 24;
  const termCols = stdout.columns || 80;

  const inputLinesArr = input.split("\n");
  const inputHeight = inputLinesArr.length;
  const statusHeight = 1;
  const msgAreaHeight = Math.max(1, termRows - inputHeight - statusHeight);

  const messageHeights = messages.map((m, i) =>
    getMessageHeight(m, termCols, expandedTools, i)
  );
  const streamingHeight = isStreaming
    ? wrapText(streamingText, termCols).length || 1
    : 0;
  const totalContentLines =
    messageHeights.reduce((a, b) => a + b, 0) + streamingHeight;

  const maxScroll = Math.max(0, totalContentLines - msgAreaHeight);
  const clampedScroll = Math.min(scrollLines, maxScroll);

  let linesNeeded = msgAreaHeight + clampedScroll;
  let linesAccumulated = streamingHeight;
  let visibleStart = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    linesAccumulated += messageHeights[i]!;
    if (linesAccumulated >= linesNeeded) {
      visibleStart = i;
      break;
    }
  }
  const visibleMessages = messages.slice(visibleStart);
  const hasMoreAbove = clampedScroll < maxScroll;
  const hasMoreBelow = clampedScroll > 0;

  /* ---------------------------------------------------------------- */
  /*  Streaming flush (batched for perf)                               */
  /* ---------------------------------------------------------------- */
  const flushChunks = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const text = streamingRef.current;
    if (!text) return;
    streamingRef.current = "";
    setStreamingText((prev) => prev + text);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushChunks();
    }, 24);
  }, [flushChunks]);

  /* ---------------------------------------------------------------- */
  /*  Add message                                                      */
  /* ---------------------------------------------------------------- */
  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Agent runner                                                     */
  /* ---------------------------------------------------------------- */
  const runAgent = useCallback(
    async (userInput: string) => {
      if (activeRef.current) return;
      activeRef.current = true;

      let conv: Message[] = [
        ...convRef.current,
        { role: "user", content: userInput },
      ];
      convRef.current = conv;
      addMessage({ role: "user", content: userInput });
      setScrollLines(0);
      setStatus("thinking");

      let iteration = 0;

      while (true) {
        if (iteration >= MAX_TOOL_ROUNDS) {
          const limitMsg = `Reached maximum of ${MAX_TOOL_ROUNDS} tool rounds. Stopping to prevent infinite loops.`;
          addMessage({ role: "assistant", content: limitMsg });
          conv = [...conv, { role: "assistant", content: limitMsg }];
          convRef.current = conv;
          break;
        }
        iteration++;

        // Scroll lock: snap to bottom if user was near bottom
        setScrollLines((prev) => (prev <= 2 ? 0 : prev));

        setIsConnecting(true);
        setIsStreaming(true);
        setStreamingText("");
        streamingRef.current = "";

        let assistantResponse: string;
        try {
          assistantResponse = await executeLLMCall(
            pruneMessages(conv),
            (chunk) => {
              streamingRef.current += chunk;
              scheduleFlush();
            }
          );

          if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
          }
          const pending = streamingRef.current;
          streamingRef.current = "";
          if (pending) {
            setStreamingText((prev) => prev + pending);
          }
          setIsConnecting(false);
        } catch (err: any) {
          if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
          }
          streamingRef.current = "";
          setIsConnecting(false);
          setStreamingText("");
          setIsStreaming(false);

          const errorMsg = `LLM Error: ${err.message ?? String(err)}`;
          addMessage({ role: "assistant", content: errorMsg });
          conv = [...conv, { role: "assistant", content: errorMsg }];
          convRef.current = conv;
          break;
        }

        if (assistantResponse.trim() === "") {
          assistantResponse = "(received empty response from model)";
        }

        streamingRef.current = "";
        setIsConnecting(false);
        setStreamingText("");
        setIsStreaming(false);

        const { invocations, errors } =
          extractToolInvocations(assistantResponse);

        if (errors.length > 0) {
          for (const err of errors) {
            const errMsg = `tool_parse_error: ${err.error} in line: ${err.raw}`;
            addMessage({ role: "user", content: errMsg });
            conv = [...conv, { role: "user", content: errMsg }];
            convRef.current = conv;
          }
        }

        addMessage({ role: "assistant", content: assistantResponse });
        conv = [...conv, { role: "assistant", content: assistantResponse }];
        convRef.current = conv;

        if (invocations.length === 0) {
          break;
        }

        for (const { name, args } of invocations) {
          const tool = (TOOL_REGISTRY as Record<string, Function>)[name];
          const parser = (TOOL_ARG_PARSERS as Record<string, Function>)[name];
          let resp: unknown;

          if (!tool) {
            resp = { error: `unknown tool: ${name}` };
          } else if (!parser) {
            resp = { error: `no arg parser for tool: ${name}` };
          } else {
            try {
              const parsedArgs = parser(args);
              resp = await tool(...parsedArgs);
            } catch (e: any) {
              resp = { error: e.message ?? String(e) };
            }
          }

          const resultStr = `tool_result(${JSON.stringify(resp)})`;
          conv = [...conv, { role: "user", content: resultStr }];
          convRef.current = conv;

          const displayStr = formatToolResultForDisplay(name, resp);
          addMessage({ role: "user", content: displayStr });
        }
      }

      convRef.current = pruneMessages(convRef.current);
      setStatus("idle");
      activeRef.current = false;
    },
    [addMessage, scheduleFlush]
  );

  /* ---------------------------------------------------------------- */
  /*  Input handling                                                   */
  /* ---------------------------------------------------------------- */
  useInput((char, key) => {
    if ((key.ctrl && char === "c") || key.escape) {
      exit();
      return;
    }

    if (key.ctrl && char === "y") {
      const lastAssistant = [...messages]
        .reverse()
        .find(
          (m) =>
            m.role === "assistant" &&
            extractToolInvocations(m.content).invocations.length === 0 &&
            m.content.trim().length > 0
        );
      if (lastAssistant) {
        copyToClipboard(lastAssistant.content);
        setCopyFeedback("copied!");
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopyFeedback(""), 1500);
      }
      return;
    }

    if (key.ctrl && char === "e") {
      const lastToolIdx = messages.findLastIndex((m) => parseToolDisplay(m.content));
      if (lastToolIdx !== -1) {
        setExpandedTools((prev) => {
          const next = new Set(prev);
          if (next.has(lastToolIdx)) next.delete(lastToolIdx);
          else next.add(lastToolIdx);
          return next;
        });
      }
      return;
    }

    if (key.ctrl && char === "a") {
      setExpandedTools((prev) => {
        const allToolIndices = new Set<number>();
        messages.forEach((m, i) => {
          if (parseToolDisplay(m.content)) allToolIndices.add(i);
        });
        if (prev.size === allToolIndices.size && allToolIndices.size > 0) {
          return new Set();
        }
        return allToolIndices;
      });
      return;
    }

    if (key.pageUp) {
      setScrollLines((prev) => prev + Math.floor(msgAreaHeight / 2));
      return;
    }
    if (key.pageDown) {
      setScrollLines((prev) => Math.max(0, prev - Math.floor(msgAreaHeight / 2)));
      return;
    }

    if (status !== "idle") return;

    if (key.return && !key.shift) {
      if (input.trim().length > 0 || input.includes("\n")) {
        const text = input;
        setInput("");
        setCursorPos(0);
        historyRef.current.push(text);
        historyIndexRef.current = -1;
        savedInputRef.current = "";
        setScrollLines(0);
        runAgent(text);
      }
      return;
    }

    if (key.return && key.shift) {
      const before = input.slice(0, cursorPos);
      const after = input.slice(cursorPos);
      setInput(before + "\n" + after);
      setCursorPos(cursorPos + 1);
      return;
    }

    if (key.backspace || key.delete) {
      if (cursorPos > 0) {
        const before = input.slice(0, cursorPos - 1);
        const after = input.slice(cursorPos);
        setInput(before + after);
        setCursorPos(cursorPos - 1);
      }
      return;
    }

    if (key.leftArrow) {
      setCursorPos((p) => Math.max(0, p - 1));
      return;
    }
    if (key.rightArrow) {
      setCursorPos((p) => Math.min(input.length, p + 1));
      return;
    }
    if (key.upArrow) {
      const beforeCursor = input.slice(0, cursorPos);
      const cursorRow = beforeCursor.split("\n").length - 1;
      if (cursorRow > 0) {
        const lines = input.split("\n");
        const currentCol =
          cursorPos - (input.lastIndexOf("\n", cursorPos - 1) + 1);
        const prevLineStart =
          lines.slice(0, cursorRow - 1).join("\n").length +
          (cursorRow - 1 > 0 ? 1 : 0);
        const prevLine = lines[cursorRow - 1]!;
        setCursorPos(prevLineStart + Math.min(currentCol, prevLine.length));
      } else {
        if (historyIndexRef.current === -1) {
          savedInputRef.current = input;
        }
        if (historyIndexRef.current < historyRef.current.length - 1) {
          historyIndexRef.current++;
          const idx =
            historyRef.current.length - 1 - historyIndexRef.current;
          const text = historyRef.current[idx]!;
          setInput(text);
          setCursorPos(text.length);
        }
      }
      return;
    }
    if (key.downArrow) {
      const beforeCursor = input.slice(0, cursorPos);
      const cursorRow = beforeCursor.split("\n").length - 1;
      const lines = input.split("\n");
      if (cursorRow < lines.length - 1) {
        const currentCol =
          cursorPos - (input.lastIndexOf("\n", cursorPos - 1) + 1);
        const nextLineStart =
          lines.slice(0, cursorRow + 1).join("\n").length + 1;
        const nextLine = lines[cursorRow + 1]!;
        setCursorPos(nextLineStart + Math.min(currentCol, nextLine.length));
      } else {
        if (historyIndexRef.current > 0) {
          historyIndexRef.current--;
          const idx =
            historyRef.current.length - 1 - historyIndexRef.current;
          const text = historyRef.current[idx]!;
          setInput(text);
          setCursorPos(text.length);
        } else if (historyIndexRef.current === 0) {
          historyIndexRef.current = -1;
          setInput(savedInputRef.current);
          setCursorPos(savedInputRef.current.length);
        }
      }
      return;
    }
    if (key.home) {
      const lineStart = input.lastIndexOf("\n", cursorPos - 1) + 1;
      setCursorPos(lineStart);
      return;
    }
    if (key.end) {
      const lineEnd = input.indexOf("\n", cursorPos);
      setCursorPos(lineEnd === -1 ? input.length : lineEnd);
      return;
    }

    if (!key.ctrl && !key.meta && char) {
      const before = input.slice(0, cursorPos);
      const after = input.slice(cursorPos);
      setInput(before + char + after);
      setCursorPos(cursorPos + char.length);
      return;
    }
  });

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  const assistantCount = messages.filter((m) => m.role === "assistant").length;

  return (
    <Box
      flexDirection="column"
      height={termRows}
      width={termCols}
      overflow="hidden"
    >
      {/* Message area */}
      <Box
        flexDirection="column"
        justifyContent="flex-end"
        height={msgAreaHeight}
        width={termCols}
        overflow="hidden"
      >
        {hasMoreAbove && (
          <Box flexDirection="row" height={1}>
            <Text color="gray" dimColor>
              {"↑ more above"}
            </Text>
          </Box>
        )}

        {visibleMessages.map((msg, i) => (
          <Box
            key={visibleStart + i}
            flexDirection="column"
            width={termCols}
            overflow="hidden"
          >
            <MessageLine
              msg={msg}
              width={termCols}
              index={visibleStart + i}
              isExpanded={expandedTools.has(visibleStart + i)}
            />
          </Box>
        ))}

        {isConnecting && clampedScroll === 0 && (
          <Box flexDirection="row" width={termCols} overflow="hidden">
            <Text color={ASSISTANT_COLOR} dimColor>
              {"..."}
            </Text>
          </Box>
        )}

        {isStreaming && !isConnecting && clampedScroll === 0 && (
          <Box flexDirection="column" width={termCols} overflow="hidden">
            {(() => {
              const lines = wrapText(streamingText, termCols);
              return lines.map((line, i) => (
                <Box key={i} flexDirection="row">
                  <Text color={ASSISTANT_COLOR}>{line}</Text>
                  {i === lines.length - 1 && (
                    <Text color="white">{"█"}</Text>
                  )}
                </Box>
              ));
            })()}
          </Box>
        )}

        {isStreaming && clampedScroll > 0 && (
          <Box flexDirection="row" height={1}>
            <Text color="yellow" dimColor>
              {"↓ streaming..."}
            </Text>
          </Box>
        )}
      </Box>

      {/* Input area */}
      <Box flexDirection="column" width={termCols} overflow="hidden">
        {inputLinesArr.map((line, lineIdx) => {
          const lineStart =
            inputLinesArr.slice(0, lineIdx).join("\n").length +
            (lineIdx > 0 ? 1 : 0);
          const lineEnd = lineStart + line.length;
          const isCursorLine = cursorPos >= lineStart && cursorPos <= lineEnd;

          if (!isCursorLine) {
            return (
              <Box
                key={lineIdx}
                flexDirection="row"
                width={termCols}
                overflow="hidden"
              >
                {lineIdx === 0 && (
                  <Text color={YOU_COLOR} bold>{"> "}</Text>
                )}
                {lineIdx > 0 && (
                  <Text color={YOU_COLOR} bold>{"  "}</Text>
                )}
                <Text>{line}</Text>
              </Box>
            );
          }

          const beforeCursor = line.slice(0, cursorPos - lineStart);
          const afterCursor = line.slice(cursorPos - lineStart);
          return (
            <Box
              key={lineIdx}
              flexDirection="row"
              width={termCols}
              overflow="hidden"
            >
              {lineIdx === 0 && (
                <Text color={YOU_COLOR} bold>{"> "}</Text>
              )}
              {lineIdx > 0 && (
                <Text color={YOU_COLOR} bold>{"  "}</Text>
              )}
              <Text>{beforeCursor}</Text>
              {status === "idle" && (
                <Text color="white">{"█"}</Text>
              )}
              <Text>{afterCursor}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Status bar */}
      <Box
        height={statusHeight}
        flexDirection="row"
        width={termCols}
        overflow="hidden"
      >
        <Text color="gray" dimColor>
          {"fff"}
          {status === "thinking" ? " ●" : " ○"}
        </Text>
        <Box flexGrow={1} />
        <Text color="gray" dimColor>
          {`${MODEL} | ${process.cwd()} | ${assistantCount} rounds`}
        </Text>
        <Box flexGrow={1} />
        <Box flexDirection="row">
          {copyFeedback && (
            <Text color="green" dimColor>
              {copyFeedback + " "}
            </Text>
          )}
          {clampedScroll > 0 && (
            <Text color="gray" dimColor>
              {`scroll ${clampedScroll} `}
            </Text>
          )}
          {hasMoreBelow && (
            <Text color="gray" dimColor>
              {"↓bottom"}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
