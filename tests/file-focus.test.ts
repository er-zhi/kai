import assert from "node:assert/strict";
import test from "node:test";
import { selectRelevantFiles } from "../src/file-focus";

test("returns all files if within budget without calling LLM", async () => {
  const files = "a.ts +5/-0\nb.ts +1/-0";
  const got = await selectRelevantFiles("fix a.ts", files, { url: "http://127.0.0.1:1", maxFiles: 5 });
  assert.deepEqual(got.sort(), ["a.ts", "b.ts"].sort());
});

test("rejects LLM-proposed paths not present in the changed-files list", async () => {
  const files = Array.from({ length: 10 }, (_, i) => `f${i}.ts +1/-0`).join("\n");
  // No LLM available — function must return [] rather than the hallucinated paths.
  const got = await selectRelevantFiles("refactor", files, {
    url: "http://127.0.0.1:1", timeoutMs: 200, maxFiles: 3,
  });
  assert.deepEqual(got, []);
});
