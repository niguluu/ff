#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v mise >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/mise" ]; then
  curl -fsSL https://mise.run | sh
fi

export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

mise use -g rust@stable

cd "$ROOT_DIR"
npm install

cd "$ROOT_DIR/rust-server"
cargo fetch

echo "ff toolchain installed."