export interface ScreenState {
  systemPrompt: string;
  prompt?: string;
  input?: string;
  stream: string;
  history?: string;
  status: string;
}

function wrapText(text: string, width: number): string[] {
  const safeWidth = Math.max(8, width);
  const sourceLines = text.length === 0 ? [""] : text.split(/\r?\n/);
  const wrapped: string[] = [];

  for (const sourceLine of sourceLines) {
    if (sourceLine.length === 0) {
      wrapped.push("");
      continue;
    }

    let remaining = sourceLine;
    while (remaining.length > safeWidth) {
      wrapped.push(remaining.slice(0, safeWidth));
      remaining = remaining.slice(safeWidth);
    }
    wrapped.push(remaining);
  }

  return wrapped;
}

function box(title: string, content: string, width: number, minRows = 1): string[] {
  const innerWidth = Math.max(12, width - 4);
  const wrapped = wrapText(content, innerWidth);
  while (wrapped.length < minRows) {
    wrapped.push("");
  }

  const top = `┌─ ${title}${"─".repeat(Math.max(0, width - title.length - 5))}┐`;
  const body = wrapped.map((line) => `│ ${line.padEnd(innerWidth, " ")} │`);
  const bottom = `└${"─".repeat(Math.max(0, width - 2))}┘`;
  return [top, ...body, bottom];
}

export function renderScreen(state: ScreenState, width = 80): string {
  const safeWidth = Math.max(24, width);
  const promptValue = state.input ?? state.prompt ?? "";
  const historyValue = state.history?.trim() || "Waiting for conversation...";
  const sections = [
    box("System Prompt", state.systemPrompt, safeWidth, 3),
    box("Conversation", historyValue, safeWidth, 8),
    box("Agent Stream", state.stream || "Waiting for backend output...", safeWidth, 6),
    box("Prompt", promptValue || "Type your request and press Enter.", safeWidth, 3),
    [`Status: ${state.status}`],
  ];

  return sections.flat().join("\n");
}