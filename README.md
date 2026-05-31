# ff

Minimal TypeScript + Rust terminal harness prototype.

Default model: `DeepSeek V4 Flash` with a `1M` context window.

## What it includes

- A simple terminal UI with:
  - a system prompt box
  - an agent streaming box
  - a prompt input box
- A Rust streaming backend that emits NDJSON events
- A `mise`-based install script

## Quick start

```bash
cd ff
./scripts/install.sh
npm run verify
npm run start
```