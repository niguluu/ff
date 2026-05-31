import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadHomeEnvFile, parseEnvFile } from "../src/env.js";

test("parseEnvFile reads simple dotenv assignments", () => {
  const parsed = parseEnvFile(`\n# comment\nDEEPSEEK_API_KEY=test-key\nOPENAI_BASE_URL= https://example.test/v1 \nQUOTED=\"hello world\"\nSINGLE='trim me'\n`);

  assert.deepEqual(parsed, {
    DEEPSEEK_API_KEY: "test-key",
    OPENAI_BASE_URL: "https://example.test/v1",
    QUOTED: "hello world",
    SINGLE: "trim me",
  });
});

test("loadHomeEnvFile loads ~/.env without overriding existing process values", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ff-home-env-"));
  const homeDir = path.join(tempDir, "home");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(
    path.join(homeDir, ".env"),
    "DEEPSEEK_API_KEY=from-home\nOPENAI_BASE_URL=https://home.example/v1\n",
  );

  const merged = loadHomeEnvFile({
    homeDir,
    baseEnv: {
      OPENAI_BASE_URL: "https://already-set.example/v1",
      PATH: "/usr/bin",
    },
  });

  assert.equal(merged.DEPPSEEK_API_KEY, undefined);
  assert.equal(merged.DEEPSEEK_API_KEY, "from-home");
  assert.equal(merged.OPENAI_BASE_URL, "https://already-set.example/v1");
  assert.equal(merged.PATH, "/usr/bin");
});