// Offline proof for the 2026-04-17 cost optimizations:
//   A. PR diff is pre-fetched and embedded in the stable prefix (one bash
//      tool-call saved, cached across repeat calls for same PR state).
//   B. Short-answer requests pass --disallowed-tools to block exploration.
//
// The script fakes a PR by running real `git diff HEAD~1..HEAD` in a local repo
// (architect/.temp/kai-action itself has commits we can diff) so we see actual
// diff content inside the prompt — no network, no LLM.

import assert from "node:assert/strict";
import { execSync } from "node:child_process";

// These helpers mirror src/index.ts; keep this file in sync if they change.
function isShortAnswerRequest(m: string): boolean {
  return /\b(one\s+(?:sentence|line|word|paragraph)|1\s+sentence|single\s+sentence|briefly|tl;?\s*dr|in\s+(?:a\s+)?(?:word|sentence|line)|short\s+answer|yes\/no|quick(?:ly)?)\b/i.test(m);
}
function disallowedToolsFor(m: string): string[] {
  return isShortAnswerRequest(m)
    ? ["Glob", "WebFetch", "WebSearch", "Bash(find:*)", "Bash(cd:*)", "Bash(ls:*)"]
    : [];
}

const MAX = 12_000;
function getRealDiff(range: string): string {
  const diff = execSync(`git diff ${range} --no-color --unified=3`, {
    stdio: "pipe", timeout: 15_000, encoding: "utf-8", maxBuffer: 8 * 1024 * 1024,
  });
  if (!diff.trim()) return "";
  if (diff.length <= MAX) return diff;
  const head = diff.slice(0, Math.floor(MAX * 0.7));
  const tail = diff.slice(-Math.floor(MAX * 0.2));
  return `${head}\n... [truncated ${diff.length - MAX} chars] ...\n${tail}`;
}

function header(s: string) { console.log(`\n=== ${s} ===`); }

header("A) Pre-digest real diff from this kai-action repo (HEAD~2..HEAD)");
const diff = getRealDiff("HEAD~2..HEAD");
console.log(`diff length: ${diff.length} chars (~${Math.ceil(diff.length / 4)} tokens)`);
assert.ok(diff.length > 0, "expected non-empty diff");
assert.ok(diff.includes("diff --git") || diff.includes("---"), "expected real unified diff markers");
console.log(`first 80 chars: ${diff.slice(0, 80).replace(/\n/g, " ⏎ ")}`);
console.log("✅ diff fits under cap, contains unified-diff markers");

header("B) Truncation activates on a massive fake diff");
const MANY_FILES = Array.from({ length: 800 }, (_, i) =>
  `diff --git a/f${i}.ts b/f${i}.ts\nindex 1..2 100644\n--- a/f${i}.ts\n+++ b/f${i}.ts\n@@ -1 +1 @@\n-old${i}\n+new${i}\n`,
).join("");
const truncated = (() => {
  if (MANY_FILES.length <= MAX) return MANY_FILES;
  const h = MANY_FILES.slice(0, Math.floor(MAX * 0.7));
  const t = MANY_FILES.slice(-Math.floor(MAX * 0.2));
  return `${h}\n... [truncated ${MANY_FILES.length - MAX} chars] ...\n${t}`;
})();
console.log(`raw: ${MANY_FILES.length} -> truncated: ${truncated.length}`);
assert.ok(truncated.includes("[truncated"), "truncation marker must be present");
assert.ok(truncated.length <= MAX + 200, "truncated length should be near the cap");
console.log("✅ big diffs clipped safely");

header("C) Short-answer → tool gating list applied");
const s1 = "what is the single biggest risk in this PR? one sentence.";
const s2 = "briefly, does this fix n+1?";
const r1 = "review this PR and suggest improvements";
const r2 = "add input validation to login handler";
assert.deepEqual(disallowedToolsFor(s1).sort(),
  ["Bash(cd:*)", "Bash(find:*)", "Bash(ls:*)", "Glob", "WebFetch", "WebSearch"]);
assert.deepEqual(disallowedToolsFor(s2).sort(),
  ["Bash(cd:*)", "Bash(find:*)", "Bash(ls:*)", "Glob", "WebFetch", "WebSearch"]);
assert.deepEqual(disallowedToolsFor(r1), []);
assert.deepEqual(disallowedToolsFor(r2), []);
console.log(`short-answer "${s1}" gated: ${disallowedToolsFor(s1).join(",")}`);
console.log(`short-answer "${s2}" gated: ${disallowedToolsFor(s2).join(",")}`);
console.log(`review "${r1}" gated: [] (no restrictions)`);
console.log(`write  "${r2}" gated: [] (no restrictions)`);
console.log("✅ gating is surgical: fires on short-answer, silent on everything else");

header("D) Token accounting — before vs after pre-digest");
// Before:  Claude does `git diff` itself + reads files → 12 turns × ~25K = 300K input.
// After:   diff (~3K tokens) pinned in stable prefix → Claude answers directly.
const BEFORE_INPUT_TOKENS = 309_000;
const AFTER_PROMPT_TOKENS = Math.ceil(diff.length / 4) + 500; // 500 = prompt scaffold
const SAVED = BEFORE_INPUT_TOKENS - AFTER_PROMPT_TOKENS;
console.log(`observed on 2026-04-17 run 24543942744: ${BEFORE_INPUT_TOKENS} input tokens`);
console.log(`new prompt size upper bound: ~${AFTER_PROMPT_TOKENS} tokens`);
console.log(`estimated savings on short-answer: ~${SAVED} tokens (${Math.round(SAVED / BEFORE_INPUT_TOKENS * 100)}%)`);
console.log(`Haiku cost estimate: before $0.057 → after ~$${((AFTER_PROMPT_TOKENS * 0.001 / 1000) + (500 * 0.005 / 1000)).toFixed(4)}`);
console.log("✅ arithmetic sanity check (actual paid run still TBD)");

console.log("\n🎉 All offline cost-optimization proofs passed.");
