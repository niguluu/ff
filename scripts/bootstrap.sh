#!/usr/bin/env bash
set -euo pipefail

FF_REPO_URL="${FF_REPO_URL:-https://github.com/niguluu/ff.git}"
FF_INSTALL_DIR="${FF_INSTALL_DIR:-$HOME/.ff}"
FF_BIN_DIR="${FF_BIN_DIR:-$HOME/.local/bin}"

if [ -d "$FF_INSTALL_DIR/.git" ]; then
  git -C "$FF_INSTALL_DIR" pull --ff-only
elif [ -e "$FF_INSTALL_DIR" ]; then
  echo "Refusing to install into existing path: $FF_INSTALL_DIR" >&2
  exit 1
else
  git clone --depth 1 "$FF_REPO_URL" "$FF_INSTALL_DIR"
fi

FF_INSTALL_DIR="$FF_INSTALL_DIR" FF_BIN_DIR="$FF_BIN_DIR" bash "$FF_INSTALL_DIR/scripts/install.sh"