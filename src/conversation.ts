import type { Message } from "./llm.js";
import { MAX_CONVERSATION_MESSAGES } from "./config.js";

export function pruneMessages(conv: Message[]): Message[] {
  const system = conv.find((m) => m.role === "system");
  const rest = conv.filter((m) => m.role !== "system");
  if (rest.length <= MAX_CONVERSATION_MESSAGES) return conv;
  const pruned = rest.slice(-MAX_CONVERSATION_MESSAGES);
  return system ? [system, ...pruned] : pruned;
}

/**
 * Rough token estimate for a set of messages. We do not have a tokenizer in the
 * loop, so we use the common ~4-chars-per-token heuristic plus a small
 * per-message overhead for role framing. This is only used to show the user how
 * much of the context budget is in play, so an approximation is fine.
 */
export function estimateTokens(conv: Message[]): number {
  let chars = 0;
  for (const m of conv) chars += m.content.length + 4;
  return Math.ceil(chars / 4);
}
