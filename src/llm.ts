import OpenAI from "openai";
import { TOOL_METADATA } from "./tools.js";

const API_KEY = process.env.OPENAI_API_KEY ?? "";
const BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com/v1";
export const MODEL = process.env.OPENAI_MODEL ?? "deepseek-v4-flash";
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? "60000");
const TEMPERATURE = Number(process.env.LLM_TEMPERATURE ?? "0.2");
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? "64000");

if (!API_KEY) {
  throw new Error(
    "OPENAI_API_KEY environment variable is required. Set it in a .env file or export it."
  );
}

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

function generateToolDescriptions(): string {
  return TOOL_METADATA.map(
    (t) =>
      `TOOL\n===\nName: ${t.name}\nDescription: ${t.description}\nSignature: ${t.signature}`
  ).join("\n\n");
}

export function getSystemPrompt(): string {
  return `You are a coding assistant whose goal is to help us solve coding tasks.
You have access to a series of tools you can execute. Here are the tools you can execute:

${generateToolDescriptions()}

IMPORTANT RULES:
1. For reading files: Use read_file. For huge files, use the limit param (e.g., read_file({"filename": "/path", "limit": 50})).
2. For editing files: Use edit_file for targeted replacements. It replaces the first occurrence of old_str with new_str.
3. For creating new files or full rewrites: Use atomic_overwrite.
4. Always use absolute file paths.
5. The bash tool can run any shell command including git, npm, node, etc. Do not tell the user to run commands manually—execute them directly.

When you want to use a tool, reply with exactly one line in the format: 'tool: TOOL_NAME({JSON_ARGS})' and nothing else.
Use compact single-line JSON OBJECT with double quotes for keys and values. Example: tool: read_file({"filename": "/home/balls/fff/src/index.tsx"}).
After receiving a tool_result(...) message, continue the task.
If no tool is needed, respond normally.`;
}

async function callWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("LLM call timed out")), ms);
    fn()
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function executeLLMCall(
  messages: Message[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const maxRetries = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (onChunk) {
        const stream = await callWithTimeout(
          () =>
            client.chat.completions.create({
              model: MODEL,
              max_tokens: MAX_TOKENS,
              temperature: TEMPERATURE,
              messages: systemMsg
                ? [
                    { role: "system" as const, content: systemMsg.content },
                    ...chatMessages,
                  ]
                : chatMessages,
              stream: true,
            }),
          TIMEOUT_MS
        );

        let fullContent = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            fullContent += delta;
            onChunk(delta);
          }
        }
        return fullContent;
      } else {
        const resp = await callWithTimeout(
          () =>
            client.chat.completions.create({
              model: MODEL,
              max_tokens: MAX_TOKENS,
              temperature: TEMPERATURE,
              messages: systemMsg
                ? [
                    { role: "system" as const, content: systemMsg.content },
                    ...chatMessages,
                  ]
                : chatMessages,
            }),
          TIMEOUT_MS
        );
        return resp.choices[0]?.message?.content ?? "";
      }
    } catch (err: any) {
      lastErr = err;
      if (err?.status === 401 || err?.status === 400) throw err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastErr;
}

export type ToolInvocation = { name: string; args: unknown };
export type ExtractError = { raw: string; error: string };

export function extractToolInvocations(
  text: string
): { invocations: ToolInvocation[]; errors: ExtractError[] } {
  const invocations: ToolInvocation[] = [];
  const errors: ExtractError[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("tool:")) continue;
    try {
      const after = line.slice("tool:".length).trim();
      const openParen = after.indexOf("(");
      if (openParen === -1) {
        errors.push({ raw: line, error: "No opening parenthesis found" });
        continue;
      }

      let depth = 0;
      let closeParen = -1;
      let inString = false;
      let stringChar = "";
      for (let i = openParen; i < after.length; i++) {
        const ch = after[i];
        if (inString) {
          if (ch === "\\") {
            i++;
            continue;
          }
          if (ch === stringChar) {
            inString = false;
          }
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
          inString = true;
          stringChar = ch;
          continue;
        }
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0) {
            closeParen = i;
            break;
          }
        }
      }
      if (closeParen === -1) {
        errors.push({
          raw: line,
          error: "No matching closing parenthesis found",
        });
        continue;
      }

      const name = after.slice(0, openParen).trim();
      const jsonStr = after.slice(openParen + 1, closeParen).trim();
      const args = JSON.parse(jsonStr);
      invocations.push({ name, args });
    } catch (err: any) {
      errors.push({ raw: line, error: err.message ?? String(err) });
      continue;
    }
  }
  return { invocations, errors };
}
