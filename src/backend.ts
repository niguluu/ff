import { readFile, writeFile } from "node:fs/promises";
import type { StreamEvent } from "./protocol.js";

export interface RunHarnessOptions {
  cwd: string;
  prompt: string;
  onEvent: (event: StreamEvent) => void;
}

interface ChatMessage {
  role: string;
  content: string;
  name?: string | undefined;
  tool_calls?: ToolCall[] | undefined;
  tool_call_id?: string | undefined;
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

const TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at the given path. Returns the file text.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative or absolute file path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write text to a file at the given path. Creates the file if it does not exist, overwrites if it does.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative or absolute file path" },
          content: { type: "string", description: "Full text to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Apply a string replacement in a file. Replaces all occurrences of old_string with new_string.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative or absolute file path" },
          old_string: { type: "string", description: "Exact text to find" },
          new_string: { type: "string", description: "Text to replace with" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
];

function resolveApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Missing API credentials. Set DEEPSEEK_API_KEY or OPENAI_API_KEY in ~/.env or your shell.");
  }
  return key;
}

function resolveApiUrl(): string {
  const base = process.env.OPENAI_BASE_URL?.trim();
  if (base) {
    const trimmed = base.replace(/\/+$/, "");
    if (trimmed.endsWith("/chat/completions")) return trimmed;
    return `${trimmed}/chat/completions`;
  }
  return "https://api.deepseek.com/chat/completions";
}

function resolveModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "deepseek-chat";
}

async function executeTool(call: ToolCall, cwd: string): Promise<string> {
  const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
  const relPath = String(args.path ?? "");
  const targetPath = relPath.startsWith("/") ? relPath : `${cwd}/${relPath}`;

  try {
    switch (call.function.name) {
      case "read_file": {
        const content = await readFile(targetPath, "utf8");
        return content;
      }
      case "write_file": {
        const content = String(args.content ?? "");
        await writeFile(targetPath, content, "utf8");
        return `Wrote ${content.length} characters to ${relPath}`;
      }
      case "edit_file": {
        const oldStr = String(args.old_string ?? "");
        const newStr = String(args.new_string ?? "");
        const content = await readFile(targetPath, "utf8");
        if (!content.includes(oldStr)) {
          return `Error: old_string not found in ${relPath}`;
        }
        const updated = content.replaceAll(oldStr, newStr);
        await writeFile(targetPath, updated, "utf8");
        return `Edited ${relPath}`;
      }
      default:
        return `Unknown tool: ${call.function.name}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function streamCompletion(
  messages: ChatMessage[],
  onChunk: (content: string) => void,
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const apiKey = resolveApiKey();
  const url = resolveApiUrl();
  const model = resolveModel();

  const body = {
    model,
    stream: true,
    messages,
    tools: TOOLS,
    tool_choice: "auto" as const,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unable to read error body");
    throw new Error(`Model API request failed with ${response.status}: ${text}`);
  }

  if (!response.body) {
    throw new Error("No response body from API");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let toolCalls: ToolCall[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") break;

      try {
        const envelope = JSON.parse(payload) as {
          choices?: Array<{
            delta: {
              content?: string;
              tool_calls?: Array<{
                index: number;
                id?: string;
                type?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string | null;
          }>;
        };
        const choice = envelope.choices?.[0];
        if (!choice) continue;

        if (choice.delta.content) {
          fullContent += choice.delta.content;
          onChunk(choice.delta.content);
        }

        if (choice.delta.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls[idx]) {
              toolCalls[idx] = {
                id: tc.id ?? `call_${idx}`,
                type: "function",
                function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "" },
              };
            } else {
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
              if (tc.id) toolCalls[idx].id = tc.id;
            }
          }
        }
      } catch {
        // ignore malformed SSE lines
      }
    }
  }

  // Filter out incomplete tool calls
  toolCalls = toolCalls.filter((tc) => tc.function.name && tc.id);

  return { content: fullContent, toolCalls };
}

export async function runHarness(options: RunHarnessOptions): Promise<void> {
  const prompt = options.prompt.trim();
  if (!prompt) {
    throw new Error("Please enter a prompt so the harness has something to stream.");
  }

  options.onEvent({ type: "meta", systemPrompt: `You are ff, a terminal harness with tool access. You can read, write, and edit files. Always use tools when asked to interact with files.` });

  const messages: ChatMessage[] = [
    { role: "system", content: `You are ff, a focused terminal harness. You have access to file tools (read_file, write_file, edit_file). Use them when the user asks you to interact with files. Keep responses short and actionable.` },
    { role: "user", content: prompt },
  ];

  let turnCount = 0;
  const maxTurns = 10;

  while (turnCount < maxTurns) {
    turnCount++;
    const { content, toolCalls } = await streamCompletion(messages, (chunk) => {
      options.onEvent({ type: "chunk", content: chunk });
    });

    const assistantMsg: ChatMessage = { role: "assistant", content };
    if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
    messages.push(assistantMsg);

    if (toolCalls.length === 0) {
      break;
    }

    // Execute tools and append results
    for (const call of toolCalls) {
      const result = await executeTool(call, options.cwd);
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: call.id,
      });
      options.onEvent({ type: "chunk", content: `\n[${call.function.name}: ${result.slice(0, 200)}${result.length > 200 ? "..." : ""}]\n` });
    }
  }

  options.onEvent({ type: "done" });
}
