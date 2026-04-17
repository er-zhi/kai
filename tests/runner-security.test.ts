import assert from "node:assert/strict";
import test from "node:test";

import { buildClaudeSpawnSpec } from "../dist/runner-spawn.js";

test("root invocation does not leak ANTHROPIC_API_KEY in argv", () => {
  const spec = buildClaudeSpawnSpec({
    isRoot: true,
    apiKey: "sk-test-secret",
    claudeArgs: ["-p", "--max-turns", "12", "--model", "claude-haiku"],
    env: {},
  });

  assert.equal(spec.command, "sudo");
  assert.equal(spec.args.includes("ANTHROPIC_API_KEY=sk-test-secret"), false);
  assert.equal(spec.args.some((arg) => arg.includes("ANTHROPIC_API_KEY=")), false);
  assert.equal(spec.env.ANTHROPIC_API_KEY, "sk-test-secret");
});

test("non-root invocation passes API key via env only", () => {
  const spec = buildClaudeSpawnSpec({
    isRoot: false,
    apiKey: "sk-test-secret",
    claudeArgs: ["-p"],
    env: {},
  });

  assert.equal(spec.command, "claude");
  assert.deepEqual(spec.args, ["-p"]);
  assert.equal(spec.env.ANTHROPIC_API_KEY, "sk-test-secret");
});
