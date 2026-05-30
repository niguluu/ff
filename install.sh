#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing fff agent dependencies..."

if ! command -v bun &>/dev/null; then
  echo "Error: bun is not installed. Install it first: https://bun.sh"
  exit 1
fi

bun install

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo ""
  echo "==> Created .env from .env.example"
  echo "    EDIT .env AND SET YOUR OPENAI_API_KEY BEFORE RUNNING."
else
  echo ""
  echo "==> .env already exists. Make sure OPENAI_API_KEY is set."
fi

echo ""
echo "==> Done. Run 'bun run start' to launch."
