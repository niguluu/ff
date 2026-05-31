#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${FF_INSTALL_DIR:-$ROOT_DIR}"
BIN_DIR="${FF_BIN_DIR:-$HOME/.local/bin}"
LAUNCHER_PATH="$BIN_DIR/ff"

ensure_mise() {
  if command -v mise >/dev/null 2>&1 || [ -x "$HOME/.local/bin/mise" ]; then
    return
  fi

  curl -fsSL https://mise.run | sh
}

export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

ensure_toolchain() {
  if command -v npm >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1; then
    return
  fi

  ensure_mise

  if ! command -v npm >/dev/null 2>&1; then
    mise use -g node@lts
  fi

  if ! command -v cargo >/dev/null 2>&1; then
    mise use -g rust@stable
  fi
}

write_launcher() {
  mkdir -p "$BIN_DIR"
  cat > "$LAUNCHER_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export PATH="\$HOME/.cargo/bin:\$PATH"
FF_HOME="\${FF_HOME:-$INSTALL_DIR}"
cd "\$FF_HOME"
exec node dist/src/main.js "\$@"
EOF
  chmod +x "$LAUNCHER_PATH"
}

ensure_toolchain

cd "$INSTALL_DIR"
npm install
npm run build

cargo build --manifest-path "$INSTALL_DIR/rust-server/Cargo.toml"

write_launcher

echo "ff installed to $INSTALL_DIR"
echo "Launcher available at $LAUNCHER_PATH"