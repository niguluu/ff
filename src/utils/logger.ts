import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

function resolveLogDir(): string {
  const fromEnv = process.env.FFF_LOG_DIR;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
  return join(homedir() || process.env.HOME || ".", ".fff", "logs");
}

const LOG_DIR = resolveLogDir();
const LOGGING_ENABLED = process.env.FFF_NO_LOG !== "1";

function sessionStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const LOG_FILE = join(LOG_DIR, `fff-${sessionStamp()}.log`);

let initialized = false;
function ensureDir(): boolean {
  if (!LOGGING_ENABLED) return false;
  if (initialized) return true;
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

function serialize(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function log(level: LogLevel, scope: string, message: string, data?: unknown): void {
  if (!ensureDir()) return;
  try {
    const ts = new Date().toISOString();
    const extra = data !== undefined ? ` ${serialize(data)}` : "";
    appendFileSync(LOG_FILE, `${ts} [${level.toUpperCase()}] ${scope}: ${message}${extra}\n`);
  } catch {
    /* logging must never break the app */
  }
}

export const logger = {
  debug: (scope: string, message: string, data?: unknown) => log("debug", scope, message, data),
  info: (scope: string, message: string, data?: unknown) => log("info", scope, message, data),
  warn: (scope: string, message: string, data?: unknown) => log("warn", scope, message, data),
  error: (scope: string, message: string, data?: unknown) => log("error", scope, message, data),
};

export function getLogFile(): string {
  return LOG_FILE;
}
