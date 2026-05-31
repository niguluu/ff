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
  fs.mkdirSync(fakeRemote, { recursive: true });

  // Fake npm and cargo so the real install.sh doesn't fail
  writeExecutable(
    path.join(fakeBinDir, "npm"),
    `#!/usr/bin/env bash
echo "fake npm $*"
`,
  );

  writeExecutable(
    path.join(fakeBinDir, "cargo"),
    `#!/usr/bin/env bash
echo "fake cargo $*"
`,
  );

  // Fake install.sh inside the remote repo (at root)
  writeExecutable(
    path.join(fakeRemote, "install.sh"),
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
  src="$2"
  dest="$3"
  mkdir -p "$dest"
  cp -R "$src"/. "$dest"/
  exit 0
fi
echo "unsupported git invocation: $*" >&2
exit 1
`,
  );

  const result = spawnSync("bash", [path.join("/home/balls/ff", "install.sh")], {
    cwd: "/home/balls/ff",
    env: {
      ...process.env,
      HOME: homeDir,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
      FF_REPO_URL: fakeRemote,
      FF_HOME: installDir,
      FF_BIN_DIR: localBinDir,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(installDir, "install.sh")), true);
  assert.equal(fs.existsSync(path.join(localBinDir, "ff")), true);
  assert.match(fs.readFileSync(commandsLog, "utf8"), /git clone/);
});
