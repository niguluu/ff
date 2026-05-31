// Persistent session storage for fff.
//
// Every conversation is written to a JSON file under ~/.fff/sessions so the
// user can pick up where they left off. The store powers the `.new` (start a
// fresh session) and `.resume` (list and reopen recent sessions) commands.
//
// Like the logger, this module must never take the UI down: all disk access is
// wrapped and failures degrade to an in-memory-only session.

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Message } from "./llm.js";
import { logger } from "./logger.js";

export type StoredSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  cwd: string;
  /** Messages as shown in the viewport (includes tool-result display rows). */
  messages: Message[];
  /** Full conversation sent to the model (includes the system prompt). */
  conversation: Message[];
};

function sessionsDir(): string {
  const fromEnv = process.env.FFF_SESSION_DIR;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
  return join(homedir() || process.env.HOME || ".", ".fff", "sessions");
}

function ensureDir(): boolean {
  try {
    mkdirSync(sessionsDir(), { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function newSessionId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Create a brand-new, empty session object (not yet written to disk). */
export function createSession(cwd: string): StoredSession {
  const now = new Date().toISOString();
  return {
    id: newSessionId(),
    createdAt: now,
    updatedAt: now,
    title: "",
    cwd,
    messages: [],
    conversation: [],
  };
}

/** Persist a session to disk. Never throws. */
export function saveSession(session: StoredSession): void {
  if (!ensureDir()) return;
  try {
    const file = join(sessionsDir(), `${session.id}.json`);
    writeFileSync(file, JSON.stringify(session, null, 2));
  } catch (err: any) {
    logger.warn("session-store", "save failed", { id: session.id, error: err?.message });
  }
}

/** Load the most recent sessions, newest first. Never throws. */
export function listSessions(limit = 10): StoredSession[] {
  try {
    const dir = sessionsDir();
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const sessions: StoredSession[] = [];
    for (const f of files) {
      try {
        const raw = readFileSync(join(dir, f), "utf-8");
        const parsed = JSON.parse(raw) as StoredSession;
        if (parsed && parsed.id) sessions.push(parsed);
      } catch {
        /* skip unreadable/corrupt session files */
      }
    }
    sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return sessions.slice(0, limit);
  } catch {
    return [];
  }
}

/** Load a single session by id. Returns null if missing/corrupt. */
export function loadSession(id: string): StoredSession | null {
  try {
    const raw = readFileSync(join(sessionsDir(), `${id}.json`), "utf-8");
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

/** Short, human-friendly label for a session in the `.resume` picker. */
export function sessionLabel(session: StoredSession): string {
  const when = session.updatedAt.replace("T", " ").slice(0, 16);
  const title = session.title.trim() || "(empty session)";
  const rounds = session.messages.filter((m) => m.role === "assistant").length;
  return `${when}  ${title}  · ${rounds} rounds`;
}
