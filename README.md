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
curl -fsSL https://raw.githubusercontent.com/niguluu/ff/main/scripts/bootstrap.sh | bash && ~/.local/bin/ff
```

The installer clones ff into `~/.ff`, builds it, and writes a launcher to `~/.local/bin/ff`.

To work on ff locally instead, clone the repository and run `./scripts/install.sh` from the project root.