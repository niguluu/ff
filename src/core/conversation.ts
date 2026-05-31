import type { Message } from "../llm/llm";
import { MAX_CONVERSATION_MESSAGES } from "./config";

export function pruneMessages(conv: Message[]): Message[] {
  const system = conv.find((m) => m.role === "system");
  const rest = conv.filter((m) => m.role !== "system");
  if (rest.length <= MAX_CONVERSATION_MESSAGES) return conv;
  const pruned = rest.slice(-MAX_CONVERSATION_MESSAGES);
  return system ? [system, ...pruned] : pruned;
}

export function estimateTokens(conv: Message[]): number {
  let chars = 0;
  for (const m of conv) chars += m.content.length + 4;
  return Math.ceil(chars / 4);
}
