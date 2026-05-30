import OpenAI from "openai";

const API_KEY = process.env.OPENAI_API_KEY ?? "";
const BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com/v1";
const MODEL = process.env.OPENAI_MODEL ?? "deepseek-chat";

if (!API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required. Set it in a .env file or export it.");
}

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

const TOOL_DESCRIPTIONS = `TOOL
===
Name: read_file
Description: Gets the full content of a file provided by the user.
Signature: read_file(filename: string) -> {file_path: string, content: string}

TOOL
===
Name: list_files
Description: Lists the files in a directory provided by the user.
Signature: list_files(path: string) -> {path: string, files: [{filename: string, type: "file" | "dir"}]}

TOOL
===
Name: edit_file
Description: Replaces first occurrence of old_str with new_str in file. If old_str is empty, create/overwrite file with new_str.
Signature: edit_file(path: string, old_str: string, new_str: string) -> {path: string, action: string}

TOOL
===
Name: get_file_skeleton
Description: Instantly reads the structural outline of a file. Returns an array of function, class, and interface signatures. Use this to map out large files quickly without reading the entire file.
Signature: get_file_skeleton(filename: string) -> {file_path: string, symbols_found: string[]}

TOOL
===
Name: read_symbol
Description: Reads the full implementation code of a specific function, class, or variable from a file. Use this after getting the skeleton to zoom in on exactly what you need to edit.
Signature: read_symbol(filename: string, symbol_name: string) -> {file_path: string, symbol: string, content: string}

TOOL
===
Name: replace_symbol
Description: Safely replaces an entire function or class block by targeting its AST node. Bypasses formatting issues. The new_code must include the full declaration (e.g., 'export function foo() { ... }').
Signature: replace_symbol(filename: string, symbol_name: string, new_code: string) -> {file_path: string, action: string}`;

export function getSystemPrompt(): string {
  return `You are a coding assistant whose goal it is to help us solve coding tasks.
You have access to a series of tools you can execute. Here are the tools you can execute:

${TOOL_DESCRIPTIONS}

When you want to use a tool, reply with exactly one line in the format: 'tool: TOOL_NAME({JSON_ARGS})' and nothing else.
Use compact single-line JSON OBJECT with double quotes for keys and values. Example: tool: read_file({"filename": "/home/balls/fff/src/index.tsx"}).
Always use absolute file paths. After receiving a tool_result(...) message, continue the task.
If no tool is needed, respond normally.`;
}

export async function executeLLMCall(messages: Message[]): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const resp = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 4000,
    temperature: 0.2,
    messages: systemMsg
      ? [{ role: "system" as const, content: systemMsg.content }, ...chatMessages]
      : chatMessages,
  });

  return resp.choices[0]?.message?.content ?? "";
}

export function extractToolInvocations(
  text: string
): Array<{ name: string; args: unknown }> {
  const invocations: Array<{ name: string; args: unknown }> = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("tool:")) continue;
    try {
      const after = line.slice("tool:".length).trim();
      const openParen = after.indexOf("(");
      const closeParen = after.lastIndexOf(")");
      if (openParen === -1 || closeParen === -1 || closeParen <= openParen) continue;
      const name = after.slice(0, openParen).trim();
      const jsonStr = after.slice(openParen + 1, closeParen).trim();
      const args = JSON.parse(jsonStr);
      invocations.push({ name, args });
    } catch {
      continue;
    }
  }
  return invocations;
}
