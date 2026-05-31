<div align="center">

# fff

### *fucking fucking fast* — a terminal AI coding agent

A hands-on coding assistant that lives in your terminal. It inspects and edits
files, runs shell commands, and drives itself through a task instead of just
chatting. Built with **Ink + React + Bun**.

</div>

---

## Contents

- [Highlights](#highlights)
- [Requirements](#requirements)
- [Install](#install)
- [Configuration](#configuration)
- [Usage](#usage)
- [Sessions](#sessions)
- [Controls](#controls)
- [Indexing the codebase](#indexing-the-codebase)
- [Development](#development)
- [Project structure](#project-structure)
- [Notes](#notes)
- [License](#license)

---

## Highlights

| Area | What you get |
| --- | --- |
| **UI** | Terminal-first interface with a Gruvbox dark theme applied to the whole screen (via terminal OSC colors). |
| **Streaming** | Live model output with a stable layout that never collapses or "glitches out" while text streams. |
| **File tools** | Read, list, edit, and atomically overwrite files. Edits report only a compact `path +added/-removed lines` summary — no noisy diffs. |
| **Shell** | `run_command` runs in its own process group and kills the whole tree on timeout/exit, so nothing is left orphaned. |
| **Agent loop** | Plans in plain text before editing, then acts. Stops and reports on failure instead of looping forever. |
| **Sessions** | Every conversation is saved. `.new` starts fresh, `.resume` reopens a recent one. |
| **Context meter** | The status bar shows an estimate of how much of the model context window is in use. |
| **Logs** | Per-session agent logs under `~/.fff/logs`. |
| **Indexer** | `fff index` regenerates `codebase-index.yaml` using the cheapest DeepSeek model. |

---

## Requirements

- [Bun](https://bun.sh) — the installer can bootstrap it via [mise](https://mise.jdx.dev) for new users.
- An OpenAI-compatible API key.
- *(Optional)* a clipboard tool for `Ctrl+O`:
  - macOS — `pbcopy`
  - Wayland — `wl-copy`
  - X11 / Linux — `xclip`

---

## Install

**Local checkout**

```bash
git clone https://github.com/niguluu/fff.git
cd fff
./install.sh
```

**Remote install**

```bash
curl -fsSL https://raw.githubusercontent.com/niguluu/fff/main/install.sh | bash
```

The installer:

- Bootstraps the toolchain for new users — installs `mise`, then `bun`, then builds (set `FFF_SKIP_BOOTSTRAP=1` to require a pre-installed bun).
- Builds the app with Bun and installs into `~/.fff` by default.
- Creates a wrapper at `~/.local/bin/fff`.
- Preserves an existing `~/.fff/.env`, or creates one from `.env.example` when needed.
- Uses a freshly downloaded archive for remote installs to avoid stale caches.

If `~/.local/bin` is not on your `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

---

## Configuration

Set environment variables in `~/.fff/.env`:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-v4-flash

# Optional tuning
MAX_TOOL_ROUNDS=100            # safety cap on agent tool rounds
MAX_CONVERSATION_MESSAGES=40   # how many messages are kept in context
LLM_CONTEXT_BUDGET=128000      # used only for the context-used meter
FFF_INDEX_MODEL=deepseek-chat  # model used by `fff index`
```

---

## Usage

Start the installed CLI:

```bash
fff
```

Or run it directly from the repo:

```bash
bun run start
```

---

## Sessions

fff persists every conversation to `~/.fff/sessions` so you never lose work.

| Command | Effect |
| --- | --- |
| `.new` | Start a fresh session (the current one is already saved). |
| `.resume` | Show a numbered list of recent sessions. Type the number to reopen one. |
| `.resume <n>` | Reopen recent session number `<n>` directly. |

The status bar shows an estimated **context used** figure (e.g. `~12.4k/128.0k ctx 10%`)
that turns orange as you approach the budget.

---

## Controls

| Key | Action |
| --- | --- |
| `Enter` | Send message |
| `Shift+Enter` | Newline (terminal-encoded Shift+Enter escapes are handled too) |
| `↑` / `↓` | History, or move the cursor across lines |
| `←` / `→` | Move cursor (`Ctrl`/`Alt`+arrows for word navigation) |
| `Page Up` / `Page Down` | Scroll the conversation (or page the prompt when it overflows) |
| `Ctrl+O` | Copy the last assistant response |
| `Ctrl+Y` | Yank (paste last killed text) |
| `Ctrl+K` / `Ctrl+U` / `Ctrl+W` | Kill to line end / line start / word back |
| `Ctrl+/` | Undo |
| `Ctrl+E` | Expand / collapse the last tool result |
| `Ctrl+C` / `Esc` | Exit cleanly (kills running commands, restores the terminal) |

---

## Indexing the codebase

```bash
fff index        # or: bun run index
```

Walks the project and writes `codebase-index.yaml` with a one-line summary per
file using the cheapest DeepSeek model (`FFF_INDEX_MODEL`, default
`deepseek-chat`).

---

## Development

```bash
bun install
bun x tsc --noEmit
bun run build
bun run dev
```

---

## Project structure

```text
src/
  agent-runner.ts         Agent loop orchestration
  app.tsx                 Top-level state + composition
  clipboard.ts            Clipboard helper
  config.ts               Runtime constants + Gruvbox palette
  conversation.ts         Conversation pruning + token estimation
  index.tsx               CLI entry point (TUI + `index` subcommand, theme/exit)
  indexer.ts              Codebase indexer (writes codebase-index.yaml)
  input-editor.ts         Input editing primitives
  input-panel.tsx         Input rendering
  kill-ring.ts            Emacs-style kill ring
  llm.ts                  LLM client, system prompt, tool parsing
  logger.ts               Per-session agent file logging
  message-format.ts       Message formatting + concise edit summaries
  message-line.tsx        Message row rendering
  message-viewport.tsx    Scrollable message viewport
  paste.ts                Bracketed-paste normalization + large-paste markers
  pi-prompt-utils.ts      Visual-line / sticky-column cursor helpers
  process-registry.ts     Tracks/kills spawned child processes
  session-store.ts        Session persistence (.new / .resume)
  text-segmentation.ts    Grapheme/word segmentation helpers
  tools-registry.ts       Tool registry + invocation
  tools.ts                Filesystem + run_command tool implementations
  undo-stack.ts           Undo history for the input editor
  use-alternate-screen.ts Terminal screen hook (no-op; managed in index.tsx)
  use-app-input.ts        Keyboard input handling
  viewport.ts             Viewport/scroll calculations
  word-navigation.ts      Word-boundary navigation
```

---

## Notes

- The app bundles with Bun for Node target output.
- The installer stages files before swapping them into place.
- Remote installs are designed to avoid serving stale source archives where possible.

---

## License

MIT. See [`LICENSE`](LICENSE).
