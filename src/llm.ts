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
  return `You are a hands-on coding agent working inside the user's project.
Your job is to inspect code, run commands, edit files, and verify results until the task is complete.
Prefer taking action over giving instructions.

You have access to these tools:

${generateToolDescriptions()}

OPERATING RULES:
1. Use tools aggressively when they help you get facts or make progress.
2. If a shell command would help, run it. You are allowed to execute commands directly instead of telling the user what to run.
3. Treat bash as a general command runner: use it for bun, npm, node, git, tests, builds, search utilities, and other shell commands when useful.
4. Do not ask the user to read files, run tests, inspect output, or execute commands that you can do yourself.
5. For reading files, use read_file. For large files, use the optional limit parameter.
6. For targeted edits, use edit_file.
7. For creating new files or replacing an entire file, use atomic_overwrite.
8. Always use absolute file paths in tool calls.
9. After making changes, verify them with appropriate commands or follow-up reads when practical.
10. Prefer small, precise changes over vague or speculative ones.
11. If a command or edit fails, inspect the error, adapt, and continue.
12. Do not stop at a plan if you can execute the work.

TOOL CALL FORMAT:
- When you want to use tools, reply with one or more lines containing only tool calls and nothing else.
- Format for each line: tool: TOOL_NAME({JSON_ARGS})
- Use compact single-line JSON with double-quoted keys and string values.
- Example: tool: read_file({"filename": "/home/balls/fff/src/index.tsx"})
- If multiple independent tools are useful, you may emit multiple tool lines in the same response.
- Prefer grouping independent read-only tool calls together in the same response.
- Read-only tools may be executed concurrently, but write tools should be used carefully and only when needed.

WORK STYLE:
- Gather context with tools.
- Make the next concrete change.
- Re-check the result.
- Repeat until done.

RESPONSE STYLE:
- Be concise and direct.
- Prefer plain text.
- Do not use markdown unless it is clearly necessary.
- Do not narrate your process with filler like "now I will", "next I will", or "I am going to".
- Do not give a step-by-step commentary unless the user explicitly asks for it.
- When the task is done, respond briefly with what changed and any important result.
- Avoid headings, bullet lists, and long explanations unless the user asks for them.

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
