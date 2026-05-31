import { stdin as input, stdout as output } from "node:process";
import { FfApp } from "./app.js";
import { renderScreen } from "./render.js";

function isPrintable(data: string): boolean {
  return /^[^\u0000-\u001f\u007f]$/u.test(data);
}

async function main(): Promise<void> {
  const app = new FfApp();

  const redraw = (): void => {
    output.write("\x1b[?25l\x1b[H\x1b[2J");
    output.write(`${renderScreen(app.state, output.columns || 80)}\n`);
  };

  const submit = async (): Promise<void> => {
    if (app.state.busy) {
      return;
    }
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

      if (app.state.busy) {
        return;
      }

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

void main();