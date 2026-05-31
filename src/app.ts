import { DEFAULT_SYSTEM_PROMPT } from "./defaults.js";
import { runHarness, type RunHarnessOptions } from "./backend.js";

export interface AppState {
  systemPrompt: string;
  input: string;
  stream: string;
  history: string;
  status: string;
  busy: boolean;
}

export interface FfAppOptions {
  cwd?: string;
  runHarness?: (options: RunHarnessOptions) => Promise<void>;
}

export class FfApp {
  readonly state: AppState = {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    input: "",
    stream: "",
    history: "",
    status: "Ready for the first prompt",
    busy: false,
  };

  readonly #cwd: string;
  readonly #runHarness: (options: RunHarnessOptions) => Promise<void>;

  constructor(options: FfAppOptions = {}) {
    this.#cwd = options.cwd ?? process.cwd();
    this.#runHarness = options.runHarness ?? runHarness;
  }

  typeInput(value: string): void {
    this.state.input = value;
  }

  appendInput(value: string): void {
    this.state.input += value;
  }

  backspaceInput(): void {
    this.state.input = this.state.input.slice(0, -1);
  }

  async submitPrompt(prompt = this.state.input): Promise<void> {
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0 || this.state.busy) {
      return;
    }

    this.state.input = trimmedPrompt;
    this.state.stream = "";
    this.state.busy = true;
    this.state.status = "Streaming from agent...";
    this.#appendHistory("You", trimmedPrompt);

    try {
      await this.#runHarness({
        cwd: this.#cwd,
        prompt: trimmedPrompt,
        onEvent: (event) => {
          if (event.type === "meta") {
            this.state.systemPrompt = event.systemPrompt;
            return;
          }

          if (event.type === "chunk") {
            this.state.stream += event.content;
            return;
          }

          if (event.type === "done") {
            this.#commitAssistantStream();
            this.state.status = "Ready for the next prompt";
          }
        },
      });

      if (this.state.status === "Streaming from agent...") {
        this.#commitAssistantStream();
        this.state.status = "Ready for the next prompt";
      }
      this.state.input = "";
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "Unknown error";
      this.state.stream = "";
    } finally {
      this.state.busy = false;
    }
  }

  #appendHistory(role: string, content: string): void {
    this.state.history = this.state.history.length === 0 ? `${role}> ${content}` : `${this.state.history}\n\n${role}> ${content}`;
  }

  #commitAssistantStream(): void {
    const response = this.state.stream.trim();
    if (response.length > 0) {
      this.#appendHistory("Assistant", response);
    }
    this.state.stream = "";
  }
}