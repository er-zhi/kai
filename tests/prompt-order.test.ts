import assert from "node:assert/strict";
import test from "node:test";
import { buildCacheFriendlyPrompt, sharesStablePrefix } from "../dist/prompt-order.js";
import { buildRepoContextInstructions } from "../dist/repo-context.js";

test("stable context appears before the task block", () => {
  const out = buildCacheFriendlyPrompt({
    stable: ["ARCH CONTEXT", "FILES LIST"],
    dynamic: ["Task: fix the bug", "Success criteria..."],
  });
  const stableIdx = out.indexOf("ARCH CONTEXT");
  const taskIdx = out.indexOf("Task:");
  assert.ok(stableIdx >= 0);
  assert.ok(taskIdx > stableIdx, "stable must precede dynamic");
});

test("two calls with same stable but different tasks share identical prefix", () => {
  const a = buildCacheFriendlyPrompt({
    stable: ["ARCH", "FILES"],
    dynamic: ["Task: add README"],
  });
  const b = buildCacheFriendlyPrompt({
    stable: ["ARCH", "FILES"],
    dynamic: ["Task: fix typo"],
  });
  assert.ok(sharesStablePrefix(a, b), "cache-relevant prefix must match");
  assert.notEqual(a, b);
});

test("different stable context does NOT share prefix", () => {
  const a = buildCacheFriendlyPrompt({
    stable: ["ARCH-V1", "FILES"],
    dynamic: ["Task: x"],
  });
  const b = buildCacheFriendlyPrompt({
    stable: ["ARCH-V2", "FILES"],
    dynamic: ["Task: x"],
  });
  assert.equal(sharesStablePrefix(a, b), false);
});

test("empty sections are skipped cleanly", () => {
  const out = buildCacheFriendlyPrompt({ stable: [""], dynamic: ["only task"] });
  assert.ok(!out.includes("STABLE CONTEXT"));
  assert.ok(out.includes("only task"));
});

test("repo context instructions expose only repos directory to the model", () => {
  const longTask = buildRepoContextInstructions(false).join("\n");
  assert.match(longTask, /repos\//);
  assert.doesNotMatch(longTask, /\/workspace\/repos/);
  assert.doesNotMatch(longTask, /\/home\/kai\/architect\/repos/);

  const shortTask = buildRepoContextInstructions(true).join("\n");
  assert.match(shortTask, /Do NOT explore repos\//);
  assert.doesNotMatch(shortTask, /\.\/repos/);
  assert.doesNotMatch(shortTask, /\/home\/kai\/architect\/repos/);
});
