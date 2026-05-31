# fff

fff is a terminal AI coding assistant built with Ink, React, and Bun. It runs in your terminal, can inspect and edit files, and is designed to act like a hands-on coding agent instead of a passive chat bot.

## What it does

- Terminal-first coding assistant UI
- Streaming model output
- File tools for reading, listing, editing, and overwriting files
- Agent loop with tool invocation support
- Scrollback, clipboard copy, and multi-line input
- Local install script with staged installation

## Requirements

- [Bun](https://bun.sh)
- An OpenAI-compatible API key
- Optional clipboard tool:
  - macOS: `pbcopy`
  - Wayland: `wl-copy`
  - X11/Linux: `xclip`

## Install

### Local checkout

```bash
git clone https://github.com/niguluu/fff.git
cd fff
./install.sh
```

### Remote install

```bash
curl -fsSL https://raw.githubusercontent.com/niguluu/fff/main/install.sh | bash
```

The installer:

- builds the app with Bun
- installs into `~/.fff` by default
- creates a wrapper at `~/.local/bin/fff`
- preserves an existing `~/.fff/.env`
- creates `~/.fff/.env` from `.env.example` when needed
- uses a fresh downloaded archive for remote installs to reduce stale-cache issues

If `~/.local/bin` is not in your `PATH`, add:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Configuration

You can configure fff with environment variables in `~/.fff/.env`.

```bash
OPENAI_API_KEY=your_key_here
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-v4-flash
MAX_TOOL_ROUNDS=100
MAX_CONVERSATION_MESSAGES=40
```

## Usage

Start the installed CLI:

```bash
fff
```

Or run it directly from the repo:

```bash
bun run start
```

## Controls

- `Enter` — send message
- `Shift+Enter` — newline
- `↑` / `↓` — history or cursor movement across lines
- `←` / `→` — move cursor
- `Page Up` / `Page Down` — scroll conversation
- `Ctrl+Y` — copy last assistant response
- `Ctrl+E` — expand/collapse last tool result
- `Ctrl+C` or `Esc` — exit

## Development

```bash
bun install
bun x tsc --noEmit
bun run build
bun run dev
```

## Project structure

```text
src/
  agent-runner.ts         Agent loop orchestration
  app.tsx                 Top-level state + composition
  clipboard.ts            Clipboard helper
  config.ts               Runtime constants
  conversation.ts         Conversation pruning
  index.tsx               CLI entry point
  input-editor.ts         Input editing primitives
  input-panel.tsx         Input rendering
  llm.ts                  LLM client, system prompt, tool parsing
  message-format.ts       Message formatting helpers
  message-line.tsx        Message row rendering
  message-viewport.tsx    Scrollable message viewport
  tools-registry.ts       Tool registry + invocation
  tools.ts                Filesystem tool implementations
  use-alternate-screen.ts Terminal screen hook
  use-app-input.ts        Keyboard input handling
  viewport.ts             Viewport/scroll calculations
```

## Notes

- The app currently bundles with Bun for Node target output.
- The installer stages files before swapping them into place.
- Remote installs are designed to avoid serving stale source archives where possible.

## License

MIT. See `LICENSE`.
