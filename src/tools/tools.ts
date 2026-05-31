import { mkdir, readdir, rename, unlink } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { logger } from "../utils/logger";
import { registerChild, unregisterChild, killChild } from "../core/process-registry";

const WORKING_DIR = resolve(process.env.WORKING_DIR || process.cwd());
const DEFAULT_COMMAND_TIMEOUT_MS = Number(process.env.FFF_COMMAND_TIMEOUT_MS ?? "120000");
const MAX_OUTPUT_CHARS = Number(process.env.FFF_MAX_OUTPUT_CHARS ?? "20000");

export interface ToolMetadata {
  name: string;
  description: string;
  signature: string;
}

export function resolveAbsPath(pathStr: string): string {
  let p = pathStr;
  if (p.startsWith("~")) {
    p = p.replace("~", homedir() || process.env.HOME || "/root");
  }
  const resolved = resolve(WORKING_DIR, p);
  const realResolved = resolve(resolved);
  const realWorking = resolve(WORKING_DIR);
  const isInside =
    realResolved === realWorking ||
    realResolved.startsWith(realWorking + sep);
  if (!isInside) {
    throw new Error(
      `Path traversal blocked: ${pathStr} resolves outside working directory (${WORKING_DIR})`
    );
  }
  return resolved;
}

export const TOOL_METADATA: ToolMetadata[] = [
  {
    name: "read_file",
    description:
      "Reads the full content of any file. Use the optional 'limit' param to read only the first N lines for huge files.",
    signature:
      'read_file(filename: string, limit?: number) -> {file_path: string, content: string, truncated?: boolean, total_lines?: number}',
  },
  {
    name: "list_files",
    description: "Lists the files in a directory provided by the user.",
    signature:
      'list_files(path: string) -> {path: string, files: [{filename: string, type: "file" | "dir"}]}',
  },
  {
    name: "edit_file",
    description:
      'Replaces the first occurrence of old_str with new_str in a file. Use old_str="" to create a new file.',
    signature:
      'edit_file(path: string, old_str: string, new_str: string) -> {path: string, action: string}',
  },
  {
    name: "atomic_overwrite",
    description:
      "Completely replaces the entire contents of a file atomically via tmp-file + OS rename. Use this when creating new files from scratch, rewriting tiny files, or when you need crash-safe full replacement.",
    signature:
      "atomic_overwrite(filename: string, new_content: string) -> {action: string}",
  },
  {
    name: "run_command",
    description:
      "Runs a shell command from the working directory and returns its output. The command runs in its own process group and is killed (with the whole tree) on timeout or when fff exits, so nothing is left orphaned. Use the optional 'timeout_ms' param for slow commands. Output is captured and truncated. If the command fails (non-zero exit), the result includes exit_code and stderr — stop and report instead of looping.",
    signature:
      'run_command(command: string, timeout_ms?: number) -> {command: string, exit_code: number, stdout: string, stderr: string, timed_out?: boolean, truncated?: boolean}',
  },
];

function countLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split("\n").length;
}

function clampOutput(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_OUTPUT_CHARS) return { text, truncated: false };
  const head = text.slice(0, MAX_OUTPUT_CHARS);
  return {
    text: `${head}\n…[truncated ${text.length - MAX_OUTPUT_CHARS} chars]`,
    truncated: true,
  };
}

export async function runCommandTool(command: string, timeoutMs?: number) {
  const cmd = (command ?? "").trim();
  if (!cmd) return { command: "", error: "empty command" };

  const timeout = timeoutMs && timeoutMs > 0 ? timeoutMs : DEFAULT_COMMAND_TIMEOUT_MS;
  logger.info("run_command", "start", { command: cmd, timeout });

  return await new Promise<Record<string, unknown>>((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(cmd, {
      cwd: WORKING_DIR,
      shell: "/bin/bash",
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    registerChild(child);

    const timer = setTimeout(() => {
      timedOut = true;
      killChild(child, "SIGTERM");
      setTimeout(() => killChild(child, "SIGKILL"), 300).unref?.();
    }, timeout);

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    function finish(exitCode: number) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unregisterChild(child);
      const out = clampOutput(stdout);
      const err = clampOutput(stderr);
      logger.info("run_command", "end", { command: cmd, exit_code: exitCode, timedOut });
      resolvePromise({
        command: cmd,
        exit_code: exitCode,
        stdout: out.text,
        stderr: err.text,
        ...(timedOut ? { timed_out: true } : {}),
        ...(out.truncated || err.truncated ? { truncated: true } : {}),
      });
    }

    child.on("error", (e) => {
      logger.error("run_command", "spawn error", { command: cmd, error: e.message });
      finish(127);
    });
    child.on("close", (code) => finish(timedOut ? 124 : code ?? 0));
  });
}

export async function readFileTool(filename: string, limit?: number) {
  const fullPath = resolveAbsPath(filename);
  try {
    const file = Bun.file(fullPath);
    const buf = await file.arrayBuffer();
    const view = new Uint8Array(buf, 0, Math.min(buf.byteLength, 8192));
    const isBinary = view.includes(0);
    if (isBinary) {
      return {
        file_path: fullPath,
        error: "Binary file detected — cannot display binary content",
      };
    }
    const content = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    if (limit && limit > 0) {
      const lines = content.split("\n");
      if (lines.length > limit) {
        const truncated = lines.slice(0, limit).join("\n");
        return {
          file_path: fullPath,
          content: truncated,
          truncated: true,
          total_lines: lines.length,
        };
      }
    }
    return { file_path: fullPath, content };
  } catch (e: any) {
    return { file_path: fullPath, error: e.message as string };
  }
}

export async function listFilesTool(path: string) {
  const fullPath = resolveAbsPath(path);
  try {
    const items = await readdir(fullPath, { withFileTypes: true });
    return {
      path: fullPath,
      files: items.map((i) => ({
        filename: i.name,
        type: i.isFile() ? "file" : ("dir" as const),
      })),
    };
  } catch (e: any) {
    return { path: fullPath, error: e.message as string };
  }
}

export async function editFileTool(
  path: string,
  oldStr: string,
  newStr: string
) {
  const fullPath = resolveAbsPath(path);
  try {
    if (oldStr === "") {
      const fileExists = await Bun.file(fullPath).exists();
      if (fileExists) {
        return {
          path: fullPath,
          action:
            "file already exists — use atomic_overwrite to replace entire file",
        };
      }
      await mkdir(dirname(fullPath), { recursive: true });
      await Bun.write(fullPath, newStr);
      return {
        path: fullPath,
        action: "created_file",
        added: countLines(newStr),
        removed: 0,
      };
    }
    const original = await Bun.file(fullPath).text();
    if (!original.includes(oldStr)) {
      return { path: fullPath, action: "old_str not found" };
    }
    const edited = original.replace(oldStr, newStr);
    await Bun.write(fullPath, edited);
    return {
      path: fullPath,
      action: "edited",
      added: countLines(newStr),
      removed: countLines(oldStr),
    };
  } catch (e: any) {
    return { path: fullPath, error: e.message as string };
  }
}

export async function atomicOverwriteTool(
  filename: string,
  newContent: string
) {
  const fullPath = resolveAbsPath(filename);
  const tmpPath = `${fullPath}.tmp`;
  try {
    let previousLines = 0;
    try {
      previousLines = countLines(await Bun.file(fullPath).text());
    } catch {
      /* new file */
    }
    await Bun.write(tmpPath, newContent);
    await rename(tmpPath, fullPath);
    return {
      action: `Atomically overwrote entire file: ${fullPath}`,
      path: fullPath,
      added: countLines(newContent),
      removed: previousLines,
    };
  } catch (e: any) {
    try {
      await unlink(tmpPath);
    } catch {
      /* tmp may not exist */
    }
    return { error: e.message as string };
  }
}
