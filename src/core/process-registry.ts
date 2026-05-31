import type { ChildProcess } from "node:child_process";
import { logger } from "../utils/logger";

const children = new Set<ChildProcess>();

export function registerChild(child: ChildProcess): void {
  children.add(child);
  child.once("exit", () => children.delete(child));
}

export function unregisterChild(child: ChildProcess): void {
  children.delete(child);
}

export function killChild(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
  if (child.killed || child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

export function killAllChildren(): void {
  if (children.size === 0) return;
  logger.info("process-registry", `killing ${children.size} child process(es)`);
  for (const child of [...children]) {
    killChild(child, "SIGTERM");
  }
  setTimeout(() => {
    for (const child of [...children]) {
      killChild(child, "SIGKILL");
    }
  }, 300).unref?.();
  children.clear();
}

export function activeChildCount(): number {
  return children.size;
}
