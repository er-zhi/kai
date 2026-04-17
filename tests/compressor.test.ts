import assert from "node:assert/strict";
import test from "node:test";
import {
  compressPromptWithQwen,
  LocalCompressorUnavailableError,
  resolveCompressionBudget,
  splitPromptIntoChunks,
} from "../src/compressor";

test("resolveCompressionBudget returns tightened defaults by tier", () => {
  // Budgets lowered so compression actually triggers for typical PR prompts.
  assert.equal(resolveCompressionBudget("haiku"), 3000);
  assert.equal(resolveCompressionBudget("sonnet"), 10000);
  assert.equal(resolveCompressionBudget("opus"), 20000);
});

test("splitPromptIntoChunks marks first and last as pinned", () => {
  const chunks = splitPromptIntoChunks("header\n\nmiddle block\n\nTask: do thing");
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0]?.pinned, true);
  assert.equal(chunks[2]?.pinned, true);
});

test("compressPromptWithQwen skips model when disabled", async () => {
  const prompt = "A".repeat(14_000);
  const result = await compressPromptWithQwen(prompt, "review this PR", "haiku", {
    disabled: true,
    budgetByTier: { haiku: 1000 },
  });
  assert.equal(result.prompt, prompt);
  assert.equal(result.metrics.usedModel, false);
  assert.equal(result.metrics.cmpPct, 0);
});

test("compressPromptWithQwen throws when url missing and prompt is large", async () => {
  const prompt = [
    "Kai, AI code reviewer.",
    "Files:\n" + "file.ts +1/-1\n".repeat(1200),
    "Task: review this PR",
  ].join("\n\n");
  await assert.rejects(
    () => compressPromptWithQwen(prompt, "review this PR", "haiku", {
      budgetByTier: { haiku: 900 },
    }),
    (error: unknown) => {
      assert.ok(error instanceof LocalCompressorUnavailableError);
      assert.match((error as Error).message, /missing KAI_COMPRESSOR_URL/i);
      return true;
    },
  );
});

test("compressPromptWithQwen skips compression for short query under threshold", async () => {
  const prompt = [
    "Kai, AI code reviewer.",
    "Files:\n" + "file.ts +1/-1\n".repeat(1200),
    "Task: review this PR",
  ].join("\n\n");
  const result = await compressPromptWithQwen(prompt, "fix", "haiku", {
    budgetByTier: { haiku: 900 },
    // Short request should bypass compression entirely.
    minQueryTokens: 10,
  });
  assert.equal(result.prompt, prompt);
  assert.equal(result.metrics.usedModel, false);
  assert.equal(result.metrics.cmpPct, 0);
});
