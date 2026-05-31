import type { Message } from "./llm.js";
import { MAX_CONVERSATION_MESSAGES } from "./config.js";

export function pruneMessages(conv: Message[]): Message[] {
  const system = conv.find((m) => m.role === "system");
  const rest = conv.filter((m) => m.role !== "system");
  if (rest.length <= MAX_CONVERSATION_MESSAGES) return conv;
  const pruned = rest.slice(-MAX_CONVERSATION_MESSAGES);
  return system ? [system, ...pruned] : pruned;
}
