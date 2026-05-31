import { Theme, renderOutputBlock } from "./tui/index.js";

export interface ScreenState {
  systemPrompt: string;
  prompt?: string;
  input?: string;
  stream: string;
  history?: string;
  status: string;
}

const theme = new Theme("unicode");

export function renderScreen(state: ScreenState, width = 80): string {
  const safeWidth = Math.max(24, width);
  const historyValue = state.history?.trim() || "Waiting for conversation...";
  const lines: string[] = [];

  // System prompt section
  lines.push(...renderOutputBlock(
    {
      header: "System Prompt",
      sections: [{ lines: [state.systemPrompt] }],
      width: safeWidth,
      state: "success",
    },
    theme,
  ));

  lines.push("");

  // Conversation history section
  lines.push(...renderOutputBlock(
    {
      header: "Conversation",
      sections: [{ lines: historyValue.split("\n") }],
      width: safeWidth,
      state: "success",
    },
    theme,
  ));

  lines.push("");

  // Agent stream section
  const streamValue = state.stream || "Waiting for backend output...";
  lines.push(...renderOutputBlock(
    {
      header: "Agent Stream",
      sections: [{ lines: streamValue.split("\n") }],
      width: safeWidth,
      state: state.stream ? "running" : "pending",
      animate: !!state.stream,
    },
    theme,
  ));

  lines.push("");
  lines.push(`Status: ${theme.fg("accent", state.status)}`);

  if (state.input !== undefined) {
    lines.push("");
    lines.push(`${theme.fg("dim", ">")} ${state.input}${theme.fg("dim", "█")}`);
  }

  return lines.join("\n");
}
