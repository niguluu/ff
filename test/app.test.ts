import test from "node:test";
import assert from "node:assert/strict";
import { FfApp } from "../src/app.js";
import type { StreamEvent } from "../src/protocol.js";

test("FfApp supports multiple prompt submissions in one session", async () => {
  const submissions: string[] = [];
  const eventsByPrompt = new Map<string, StreamEvent[]>([
    [
      "first question",
      [
        { type: "meta", systemPrompt: "system one" },
        { type: "chunk", content: "hello " },
        { type: "chunk", content: "there" },
        { type: "done" },
      ],
    ],
    [
      "second question",
      [
        { type: "chunk", content: "second" },
        { type: "chunk", content: " answer" },
        { type: "done" },
      ],
    ],
  ]);

  const app = new FfApp({
    runHarness: async ({ prompt, onEvent }) => {
      submissions.push(prompt);
      for (const event of eventsByPrompt.get(prompt) ?? []) {
        onEvent(event);
      }
    },
  });

  await app.submitPrompt("first question");
  await app.submitPrompt("second question");

  assert.deepEqual(submissions, ["first question", "second question"]);
  assert.equal(app.state.systemPrompt, "system one");
  assert.equal(app.state.status, "Ready for the next prompt");
  assert.equal(app.state.input, "");
  assert.match(app.state.history, /You> first question/);
  assert.match(app.state.history, /Assistant> hello there/);
  assert.match(app.state.history, /You> second question/);
  assert.match(app.state.history, /Assistant> second answer/);
});

test("FfApp surfaces harness failures without closing the session state", async () => {
  const app = new FfApp({
    runHarness: async () => {
      throw new Error("missing API key");
    },
  });

  await app.submitPrompt("broken");

  assert.equal(app.state.status, "missing API key");
  assert.equal(app.state.input, "broken");
  assert.match(app.state.history, /You> broken/);
});