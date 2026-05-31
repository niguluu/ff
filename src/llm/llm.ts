import OpenAI from "openai";
import { TOOL_METADATA } from "../tools/tools";

const API_KEY = process.env.OPENAI_API_KEY ?? "";
const BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com/v1";
export const MODEL = process.env.OPENAI_MODEL ?? "deepseek-v4-flash";
export const INDEX_MODEL = process.env.FFF_INDEX_MODEL ?? "deepseek-chat";
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
  return `You are fff ("fucking fucking fast"), a hands-on coding agent working inside the user's project.
Your job is to inspect code, run commands, edit files, and verify results until the task is complete.
Prefer taking action over giving instructions. Be fast and decisive.

You have access to these tools:

${generateToolDescriptions()}

PLANNING (IMPORTANT):
- Before you edit ANY files, first write a short plain-text plan: a few plain sentences (or a tight numbered list) describing what you are about to change and why.
- The plan comes first, in plain text, with no tool calls in the same message. Only after laying out the plan should you start editing.
- For trivial single-file tweaks the plan can be one sentence. For anything larger, outline the steps before touching files.

OPERATING RULES:
1. Use tools aggressively when they help you get facts or make progress.
2. If a shell command would help, run it with run_command. You are allowed to execute commands directly instead of telling the user what to run.
3. run_command is a general command runner: use it for bun, npm, node, git, tests, builds, search utilities, and other shell commands when useful. Commands run in their own process group and are killed automatically on timeout or exit, so they never leak.
4. Do not ask the user to read files, run tests, inspect output, or execute commands that you can do yourself.
5. For reading files, use read_file. For large files, use the optional limit parameter.
6. For targeted edits, use edit_file. For creating new files or full rewrites, use atomic_overwrite. Always use absolute file paths.
7. After making changes, verify them with appropriate commands or follow-up reads when practical.
8. Prefer small, precise changes over vague or speculative ones.
9. Do not stop at a plan if you can execute the work.

FAILURE HANDLING (IMPORTANT):
- The user does not want you to grind on a failing command forever. If a command fails (non-zero exit_code) or times out, do NOT blindly retry the same thing in a loop.
- Make at most one focused, well-reasoned attempt to fix an obvious cause. If it still fails, STOP and tell the user plainly: what failed, the key error line, and what you would try next. Hand control back instead of spinning.
- Never fabricate command output. If you did not run something, say so.

FILE STRUCTURE:
- Keep the project organized. When you add code, place it in a sensible location and create directories as needed (e.g. group related modules) rather than dumping everything in one file.
- Build the structure incrementally as you work: create the folder/file, put the code where it belongs, and keep imports tidy.

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
- Avoid headings, bullet lists, and long explanations unless the user asks for them.

REPORTING EDITS AND FEEDBACK:
- After editing files, do NOT paste back the file contents or a big diff. The UI already shows each edit as a compact "path +added/-removed lines" line.
- Summarize the outcome in plain text: name the files you changed and, in one short phrase each, what changed. The user wants the final structure of the changes, not the body.
- Give clear, useful feedback at the end of a turn: state what is done, what (if anything) is left, and the single most important next step or result. If something failed, say so plainly and stop.

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
