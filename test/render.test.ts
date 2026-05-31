import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from "../src/defaults.js";
import { parseStreamEvent } from "../src/protocol.js";
import { renderScreen } from "../src/render.js";

test("default system prompt advertises the configured model", () => {
  assert.match(DEFAULT_SYSTEM_PROMPT, new RegExp(DEFAULT_MODEL));
  assert.match(DEFAULT_SYSTEM_PROMPT, new RegExp(DEFAULT_CONTEXT_WINDOW));
});

test("renderScreen shows stream and history without boxes", () => {
  const screen = renderScreen(
    {
      systemPrompt: "system",
      prompt: "user prompt",
      stream: "agent stream",
      status: "Idle",
    },
    48,
  );

  assert.match(screen, /agent stream/);
  assert.doesNotMatch(screen, /┌─/);
  assert.doesNotMatch(screen, /System Prompt/);
  assert.doesNotMatch(screen, /Agent Stream/);
});

test("parseStreamEvent rejects invalid events", () => {
  assert.throws(() => parseStreamEvent('{"type":"chunk"}'));
});

test("parseStreamEvent parses done event", () => {
  assert.deepEqual(parseStreamEvent('{"type":"done"}'), { type: "done" });
});
