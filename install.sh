#!/usr/bin/env bash
set -euo pipefail

FF_HOME="${FF_HOME:-$HOME/.ff}"
BIN_DIR="${FF_BIN_DIR:-$HOME/.local/bin}"
LAUNCHER="$BIN_DIR/ff"
REPO="${FF_REPO_URL:-https://github.com/niguluu/ff.git}"

ensure_mise() {
  if command -v mise >/dev/null 2>&1 || [ -x "$HOME/.local/bin/mise" ]; then
    return
  fi
  curl -fsSL https://mise.run | sh
}

ensure_toolchain() {
  if command -v npm >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1; then
    return
  fi
  ensure_mise
  if ! command -v npm >/dev/null 2>&1; then
    "$HOME/.local/bin/mise" use -g node@lts
  fi
  if ! command -v cargo >/dev/null 2>&1; then
    "$HOME/.local/bin/mise" use -g rust@stable
  fi
}

install_ff() {
  if [ -d "$FF_HOME/.git" ]; then
    echo "Updating ff at $FF_HOME ..."
    git -C "$FF_HOME" pull --ff-only
  else
    echo "Cloning ff to $FF_HOME ..."
    rm -rf "$FF_HOME"
    git clone "$REPO" "$FF_HOME"
  fi

  cd "$FF_HOME"

  echo "Installing node dependencies ..."
  npm install

  echo "Building TypeScript ..."
  npm run build

  echo "Building Rust backend ..."
  cargo build --manifest-path "$FF_HOME/rust-server/Cargo.toml"

  mkdir -p "$BIN_DIR"

  cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export PATH="\$HOME/.cargo/bin:\$PATH"
FF_HOME="\${FF_HOME:-$FF_HOME}"
cd "\$FF_HOME"
exec node dist/src/main.js "\$@"
EOF

  chmod +x "$LAUNCHER"

  if ! echo "$PATH" | grep -q "$BIN_DIR"; then
    echo ""
    echo "Add $BIN_DIR to your PATH:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
  fi

  echo ""
  echo "ff installed. Run: ff <prompt>"
}

ensure_toolchain
install_ff
