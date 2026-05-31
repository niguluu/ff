import type { ToolInvocation } from "./llm.js";
import type { Segment } from "./types.js";

export function wrapText(text: string, maxWidth: number): string[] {
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

export function parseSegments(text: string): Segment[] {
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

export function formatToolResultForDisplay(name: string, result: unknown): string {
  return `__tool_result__:${name}:${JSON.stringify(result)}`;
}

export function parseToolDisplay(
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

export function summarizeToolDisplay(name: string, result: any): string {
  if (result?.error) return `❌ ${name}: ${result.error}`;
  switch (name) {
    case "read_file": {
      const path = result.file_path ?? "unknown";
      if (result.truncated) {
        return `📄 read: ${path} (${result.total_lines} lines, truncated)`;
      }
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
      const match = action.match(/Atomically overwrote entire file: (.+)/);
      const path = match ? match[1] : "unknown";
      return `💾 write: ${path}`;
    }
    default:
      return `🔧 ${name}`;
  }
}

export function formatToolCallArgs(invocation: ToolInvocation): string {
  const args = invocation.args as any;
  switch (invocation.name) {
    case "read_file":
      return typeof args === "string" ? args : args?.filename ?? "";
    case "list_files":
      return typeof args === "string" ? args : args?.path ?? "";
    case "edit_file":
      return args?.path ?? "";
    case "atomic_overwrite":
      return args?.filename ?? "";
    default:
      return "";
  }
}
