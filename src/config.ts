import { getSystemPrompt } from "./llm.js";

export const SYSTEM_PROMPT = getSystemPrompt();

export const GRUVBOX_BG = "#282828";
export const GRUVBOX_BG0_HARD = "#1d2021";
export const GRUVBOX_BG0_SOFT = "#32302f";
export const GRUVBOX_BG1 = "#3c3836";
export const GRUVBOX_BG3 = "#665c54";
export const GRUVBOX_FG = "#ebdbb2";
export const GRUVBOX_FG_DIM = "#a89984";
export const GRUVBOX_RED = "#fb4934";
export const GRUVBOX_GREEN = "#b8bb26";
export const GRUVBOX_YELLOW = "#fabd2f";
export const GRUVBOX_BLUE = "#83a598";
export const GRUVBOX_PURPLE = "#d3869b";
export const GRUVBOX_AQUA = "#8ec07c";
export const GRUVBOX_ORANGE = "#fe8019";

export const YOU_COLOR = GRUVBOX_BLUE;
export const ASSISTANT_COLOR = GRUVBOX_YELLOW;
export const TOOL_COLOR = GRUVBOX_AQUA;
export const TOOL_READ_COLOR = GRUVBOX_GREEN;
export const TOOL_LIST_COLOR = GRUVBOX_BLUE;
export const TOOL_WRITE_COLOR = GRUVBOX_PURPLE;
export const TOOL_ERROR_COLOR = GRUVBOX_RED;
export const ERROR_COLOR = GRUVBOX_RED;
export const MUTED_COLOR = GRUVBOX_FG_DIM;
export const BORDER_COLOR = GRUVBOX_BG3;
// Brighter accent used for the prompt frame and the divider above the status
// bar so the three regions (transcript / prompt / status) are clearly separated.
export const PROMPT_ACCENT_COLOR = GRUVBOX_BLUE;
export const SEPARATOR_COLOR = GRUVBOX_BG3;
export const TEXT_COLOR = GRUVBOX_FG;
export const STATUS_SUCCESS_COLOR = GRUVBOX_GREEN;
export const STATUS_BUSY_COLOR = GRUVBOX_ORANGE;

// Model context window. Used to render the "context used" indicator in the
// status bar. The target model has a 1M-token window, so we default to that and
// do NOT artificially shrink the agent's budget. Override via env if needed.
export const CONTEXT_BUDGET = Number(process.env.LLM_CONTEXT_BUDGET ?? "1000000");

export const MAX_TOOL_ROUNDS = Number(process.env.MAX_TOOL_ROUNDS ?? "100");
// We do not want to limit the agent: with a 1M context window we keep the full
// conversation by default. Pruning only kicks in if the user explicitly sets a
// smaller MAX_CONVERSATION_MESSAGES.
export const MAX_CONVERSATION_MESSAGES = Number(
  process.env.MAX_CONVERSATION_MESSAGES ?? "100000"
);
