export type StreamEvent =
  | { type: "meta"; systemPrompt: string }
  | { type: "chunk"; content: string }
  | { type: "done" };

export function parseStreamEvent(line: string): StreamEvent {
  const parsed = JSON.parse(line) as Partial<StreamEvent> & { system_prompt?: string };

  if (parsed.type === "meta" && typeof parsed.systemPrompt === "string") {
    return { type: "meta", systemPrompt: parsed.systemPrompt };
  }

  if (parsed.type === "meta" && typeof parsed.system_prompt === "string") {
    return { type: "meta", systemPrompt: parsed.system_prompt };
  }

  if (parsed.type === "chunk" && typeof parsed.content === "string") {
    return { type: "chunk", content: parsed.content };
  }

  if (parsed.type === "done") {
    return { type: "done" };
  }

  throw new Error(`Invalid stream event: ${line}`);
}