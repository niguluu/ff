import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from "../src/defaults.js";
import { parseStreamEvent } from "../src/protocol.js";
import { renderScreen } from "../src/render.js";

test("default system prompt advertises the configured model", () => {
  assert.match(DEFAULT_SYSTEM_PROMPT, new RegExp(DEFAULT_MODEL));
  assert.match(DEFAULT_SYSTEM_PROMPT, new RegExp(DEFAULT_CONTEXT_WINDOW));
});

test("renderScreen includes all requested boxes", () => {
  const screen = renderScreen(
    {
      systemPrompt: "system",
      prompt: "user prompt",
      stream: "agent stream",
      status: "Idle",
    },
    48,
  );

  assert.match(screen, /System Prompt/);
  assert.match(screen, /Agent Stream/);
  assert.match(screen, /Prompt/);
  assert.match(screen, /user prompt/);
});

test("parseStreamEvent rejects invalid events", () => {
  assert.throws(() => parseStreamEvent('{"type":"chunk"}'));
});

test("parseStreamEvent parses done event", () => {
  assert.deepEqual(parseStreamEvent('{"type":"done"}'), { type: "done" });
});