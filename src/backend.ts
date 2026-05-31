import { spawn } from "node:child_process";
import path from "node:path";
import { parseStreamEvent, type StreamEvent } from "./protocol.js";

export interface RunHarnessOptions {
  cwd: string;
  prompt: string;
  onEvent: (event: StreamEvent) => void;
}

export async function runHarness(options: RunHarnessOptions): Promise<void> {
  const manifestPath = path.join(options.cwd, "rust-server", "Cargo.toml");
  const child = spawn(
    "cargo",
    ["run", "--quiet", "--manifest-path", manifestPath, "--", options.prompt],
    {
      cwd: options.cwd,
      env: {
        ...process.env,
        PATH: `${process.env.HOME ?? ""}/.cargo/bin:${process.env.PATH ?? ""}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stdoutBuffer = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      options.onEvent(parseStreamEvent(trimmed));
    }
  });

  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (stdoutBuffer.trim().length > 0) {
        options.onEvent(parseStreamEvent(stdoutBuffer.trim()));
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `Rust harness exited with code ${code ?? -1}`));
    });
  });
}