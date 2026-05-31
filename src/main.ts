import { stdin as input, stdout as output } from "node:process";
import { FfApp } from "./app.js";
import { runHarness } from "./backend.js";
import { renderScreen } from "./render.js";

function isPrintable(data: string): boolean {
  return /^[^\u0000-\u001f\u007f]$/u.test(data);
}

async function runOneShot(prompt: string): Promise<void> {
  const app = new FfApp({
    runHarness: async (options) => {
      await runHarness({
        ...options,
        onEvent: (event) => {
          options.onEvent(event);
          if (event.type === "chunk") {
            output.write("\x1b[?25l\x1b[H\x1b[2J");
            output.write(`${renderScreen(app.state, output.columns || 80)}\n`);
          }
        },
      });
    },
  });

  const redraw = (): void => {
    output.write("\x1b[?25l\x1b[H\x1b[2J");
    output.write(`${renderScreen(app.state, output.columns || 80)}\n`);
  };

  redraw();
  await app.submitPrompt(prompt);
  redraw();
  output.write("\x1b[?25h\n");
}

async function runInteractive(): Promise<void> {
  const app = new FfApp({
    runHarness: async (options) => {
      await runHarness({
        ...options,
        onEvent: (event) => {
          options.onEvent(event);
          if (event.type === "chunk") {
            output.write("\x1b[?25l\x1b[H\x1b[2J");
            output.write(`${renderScreen(app.state, output.columns || 80)}\n`);
          }
        },
      });
    },
  });

  const redraw = (): void => {
    output.write("\x1b[?25l\x1b[H\x1b[2J");
    output.write(`${renderScreen(app.state, output.columns || 80)}\n`);
  };

  const submit = async (): Promise<void> => {
    if (app.state.busy) return;
    await app.submitPrompt();
    redraw();
  };

  redraw();
  input.setRawMode?.(true);
  input.setEncoding("utf8");
  input.resume();

  await new Promise<void>((resolve) => {
    const onData = (data: string): void => {
      if (data === "\u0003" || data === "\u0004") {
        cleanup();
        resolve();
        return;
      }

      if (data === "\r" || data === "\n") {
        void submit();
        return;
      }

      if (app.state.busy) return;

      if (data === "\u007f") {
        app.backspaceInput();
        redraw();
        return;
      }

      if (isPrintable(data)) {
        app.appendInput(data);
        redraw();
      }
    };

    const cleanup = (): void => {
      input.off("data", onData);
      input.setRawMode?.(false);
      output.write("\x1b[?25h\n");
    };

    input.on("data", onData);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const hasArgs = args.length > 0;
  const isTTY = input.isTTY;

  if (hasArgs) {
    await runOneShot(args.join(" "));
    return;
  }

  if (isTTY) {
    await runInteractive();
    return;
  }

  // Pipe mode: read prompt from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(chunk);
  }
  const prompt = Buffer.concat(chunks).toString("utf8").trim();

  if (!prompt) {
    output.write("Usage: ff <prompt>\n");
    output.write("       echo 'prompt' | ff\n");
    output.write("       ff              (interactive TUI)\n");
    process.exit(1);
  }

  await runOneShot(prompt);
}

void main();
