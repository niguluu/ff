import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runHarness } from "./backend.js";
import { DEFAULT_SYSTEM_PROMPT } from "./defaults.js";
import { renderScreen, type ScreenState } from "./render.js";

const state: ScreenState = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  prompt: "",
  stream: "",
  status: "Idle",
};

function redraw(): void {
  output.write("\x1Bc");
  output.write(`${renderScreen(state, output.columns || 80)}\n`);
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  redraw();
  const prompt = await rl.question("ff> ");
  state.prompt = prompt;
  state.stream = "";
  state.status = "Streaming from Rust backend...";
  redraw();

  try {
    await runHarness({
      cwd: process.cwd(),
      prompt,
      onEvent(event) {
        if (event.type === "meta") {
          state.systemPrompt = event.systemPrompt;
        } else if (event.type === "chunk") {
          state.stream += event.content;
        } else {
          state.status = "Done";
        }
        redraw();
      },
    });
    state.status = "Done";
  } catch (error) {
    state.status = error instanceof Error ? error.message : "Unknown error";
  } finally {
    redraw();
    rl.close();
  }
}

void main();