import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendContextHistory, buildDynamicPromptFromManifest, createDynamicContextPack } from "../src/context-pack";
import type { RouterDecision } from "../src/router";

const route: RouterDecision = {
  intent: "review",
  decision: "call-model",
  confidence: 0.9,
  modelTier: "haiku",
  estimatedTokens: 100,
  estimatedCostUsd: 0,
  reason: "test",
  normalizedMessage: "review this",
  maxContextTokens: 10_000,
  commitExpected: false,
  source: "rules",
};

test("createDynamicContextPack writes manifest and context files", () => {
  const runId = `test-${Date.now()}`;
  const pack = createDynamicContextPack({
    runId,
    owner: "o",
    repo: "r",
    issueNumber: 5,
    userMessage: "review this PR",
    rawMessage: "@kai review this PR",
    route,
    prTitle: "Title",
    prBody: "Body",
    filesList: "src/a.ts +1/-1",
    prCommentsContext: "u: msg",
    repoFullName: "o/r",
    architectureContext: "arch data",
  });

  try {
    const manifestRaw = readFileSync(pack.manifestPath, "utf-8");
    const manifest = JSON.parse(manifestRaw) as { files: { task: string; history: string; architecture: string | null } };
    assert.ok(manifest.files.task.endsWith("task.txt"));
    assert.ok(manifest.files.history.endsWith("history.jsonl"));
    assert.ok(manifest.files.architecture);
  } finally {
    rmSync(pack.baseDir, { recursive: true, force: true });
  }
});

test("appendContextHistory appends jsonl event", () => {
  const base = mkdtempSync(join(tmpdir(), "kai-context-pack-"));
  try {
    const historyPath = join(base, "history.jsonl");
    appendContextHistory(historyPath, "compression", { cmpPct: 37 });
    const raw = readFileSync(historyPath, "utf-8");
    assert.match(raw, /"event":"compression"/);
    assert.match(raw, /"cmpPct":37/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("buildDynamicPromptFromManifest references manifest path and chain", () => {
  const prompt = buildDynamicPromptFromManifest(
    "review PR",
    "kodif/repo",
    route,
    "/tmp/kai-context/manifest.json",
    false,
  );
  assert.match(prompt, /Dynamic context manifest/);
  assert.match(prompt, /RTK command rewrites \+ Qwen3 context compression/);
});
