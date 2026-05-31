import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function writeExecutable(filePath: string, contents: string): void {
  fs.writeFileSync(filePath, contents, { mode: 0o755 });
}

test("install script creates the ff checkout and launcher in user-local paths", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ff-install-test-"));
  const homeDir = path.join(tempDir, "home");
  const fakeBinDir = path.join(tempDir, "fake-bin");
  const installDir = path.join(homeDir, ".ff");
  const localBinDir = path.join(homeDir, ".local", "bin");
  const commandsLog = path.join(tempDir, "commands.log");
  const fakeRemote = path.join(tempDir, "remote.git");

  fs.mkdirSync(fakeBinDir, { recursive: true });
  fs.mkdirSync(localBinDir, { recursive: true });
  fs.mkdirSync(path.join(fakeRemote, "scripts"), { recursive: true });

  writeExecutable(
    path.join(fakeRemote, "scripts", "install.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/ff" <<'EOF'
#!/usr/bin/env bash
echo fake ff
EOF
chmod +x "$HOME/.local/bin/ff"
`,
  );

  writeExecutable(
    path.join(fakeBinDir, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'git %s\n' "$*" >> "${commandsLog}"
if [ "$1" = "clone" ]; then
  src="$4"
  dest="$5"
  mkdir -p "$dest"
  cp -R "$src"/. "$dest"/
  exit 0
fi
echo "unsupported git invocation: $*" >&2
exit 1
`,
  );

  const result = spawnSync("bash", ["scripts/bootstrap.sh"], {
    cwd: "/home/balls/ff",
    env: {
      ...process.env,
      HOME: homeDir,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
      FF_REPO_URL: fakeRemote,
      FF_INSTALL_DIR: installDir,
      FF_BIN_DIR: localBinDir,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(installDir, "scripts", "install.sh")), true);
  assert.equal(fs.existsSync(path.join(localBinDir, "ff")), true);
  assert.match(fs.readFileSync(commandsLog, "utf8"), /git clone --depth 1/);
});