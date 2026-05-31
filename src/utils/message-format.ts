import type { ToolInvocation } from "../llm/llm";
import type { Segment } from "../core/types";

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

function shortenPath(path: string): string {
  const cwd = process.cwd();
  if (path.startsWith(cwd + "/")) return path.slice(cwd.length + 1);
  return path;
}

function changeSummary(result: any): string {
  const added = typeof result.added === "number" ? result.added : null;
  const removed = typeof result.removed === "number" ? result.removed : null;
  if (added === null && removed === null) return "";
  return `  +${added ?? 0}/-${removed ?? 0} lines`;
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
      const path = shortenPath(result.path ?? "unknown");
      const action = result.action ?? "done";
      if (action === "edited" || action === "created_file") {
        const verb = action === "created_file" ? "create" : "edit";
        return `✏️ ${verb}: ${path}${changeSummary(result)}`;
      }
      return `✏️ edit: ${path} (${action})`;
    }
    case "atomic_overwrite": {
      const action = result.action ?? "";
      const match = action.match(/Atomically overwrote entire file: (.+)/);
      const path = shortenPath(result.path ?? (match ? match[1] : "unknown"));
      return `💾 write: ${path}${changeSummary(result)}`;
    }
    case "run_command": {
      const cmd = result.command ?? "";
      const code = result.exit_code ?? 0;
      const status = result.timed_out ? "timeout" : code === 0 ? "ok" : `exit ${code}`;
      return `⚡ run: ${cmd} (${status})`;
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
    case "run_command":
      return typeof args === "string" ? args : args?.command ?? "";
    default:
      return "";
  }
}
