export interface ScreenState {
  systemPrompt: string;
  prompt?: string;
  input?: string;
  stream: string;
  history?: string;
  status: string;
}

export function renderScreen(state: ScreenState, _width = 80): string {
  const lines: string[] = [];

  if (state.history) {
    lines.push(state.history);
    lines.push("");
  }

  if (state.stream) {
    lines.push(state.stream);
  }

  if (state.input !== undefined) {
    if (lines.length > 0) lines.push("");
    lines.push(`> ${state.input}`);
  }

  return lines.join("\n");
}
