#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/niguluu/fff.git"
INSTALL_DIR="${FFF_INSTALL_DIR:-$HOME/.fff}"
BIN_DIR="${FFF_BIN_DIR:-$HOME/.local/bin}"
BIN_PATH="$BIN_DIR/fff"

echo "==> fff installer"

# Check bun
if ! command -v bun &>/dev/null; then
  echo "Error: bun is not installed. Install it first: https://bun.sh"
  exit 1
fi

# Detect if we're being piped (not run from a local repo)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -f "$SCRIPT_DIR/package.json" ]]; then
  TMP_DIR="$(mktemp -d)"
  echo "==> Cloning $REPO_URL..."
  git clone --depth 1 "$REPO_URL" "$TMP_DIR"
  SCRIPT_DIR="$TMP_DIR"
fi

# Build
echo "==> Building fff..."
cd "$SCRIPT_DIR"
bun install
bun build src/index.tsx --outdir dist --target node --external react-devtools-core

# Install files
echo "==> Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp -f dist/index.js "$INSTALL_DIR/"
cp -f package.json "$INSTALL_DIR/" 2>/dev/null || true

# .env
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  if [[ -f "$SCRIPT_DIR/.env" ]]; then
    cp "$SCRIPT_DIR/.env" "$INSTALL_DIR/.env"
  elif [[ -f "$SCRIPT_DIR/.env.example" ]]; then
    cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/.env"
    echo ""
    echo "==> Created $INSTALL_DIR/.env from example"
    echo "    EDIT IT AND SET YOUR OPENAI_API_KEY BEFORE RUNNING."
  fi
else
  echo "==> $INSTALL_DIR/.env already exists. Keeping existing config."
fi

# Create bin wrapper
mkdir -p "$BIN_DIR"
cat > "$BIN_PATH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
FFF_HOME="${FFF_INSTALL_DIR:-$HOME/.fff}"
if [[ ! -f "$FFF_HOME/dist/index.js" ]]; then
  echo "Error: fff not found at $FFF_HOME/dist/index.js" >&2
  echo "Re-run the install script." >&2
  exit 1
fi
# Load env from install dir if present
if [[ -f "$FFF_HOME/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$FFF_HOME/.env"
  set +a
fi
exec bun run "$FFF_HOME/dist/index.js" "$@"
EOF
chmod +x "$BIN_PATH"

# Check PATH
echo ""
echo "==> Installed wrapper to $BIN_PATH"
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo ""
  echo "WARNING: $BIN_DIR is not in your PATH."
  echo "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
  echo ""
  echo "  export PATH=\"$BIN_DIR:\$PATH\""
  echo ""
  echo "Then reload: source ~/.bashrc  (or ~/.zshrc)"
else
  echo "Run 'fff' from anywhere to start."
fi

echo ""
echo "==> Done."
