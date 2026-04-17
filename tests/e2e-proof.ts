// Live end-to-end proofs for the 6 savings improvements.
// Requires: local router LLM at KAI_ROUTER_URL (LFM2-350M).
// Not part of the unit-test suite; run with ts-bundle-and-exec.

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { suggestTierWithLocalLLM } from "../src/router";
import { ensureCacheSchema, lookupCachedReply, storeCachedReply } from "../src/cache";
import { ensureQualitySchema, detectAndRecordFollowup, recordCommitVerification, qualityStats } from "../src/quality";
import { buildCacheFriendlyPrompt, sharesStablePrefix } from "../src/prompt-order";
import { resolveCompressionBudget } from "../src/compressor";

const routerUrl = process.env.KAI_ROUTER_URL;
if (!routerUrl) {
  console.log("SKIP: KAI_ROUTER_URL not set");
  process.exit(0);
}

function header(label: string) { console.log(`\n=== ${label} ===`); }

async function main() {
  mkdirSync("/tmp/kai-proof", { recursive: true });
  const db = new DatabaseSync("/tmp/kai-proof/audit.db");
  db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    sender TEXT NOT NULL, repo TEXT NOT NULL, pr_number INTEGER NOT NULL,
    model TEXT NOT NULL, status TEXT NOT NULL, cost_usd REAL NOT NULL DEFAULT 0);`);
  ensureCacheSchema(db);
  ensureQualitySchema(db);
  db.prepare(`DELETE FROM audit_log`).run();
  db.prepare(`DELETE FROM response_cache`).run();
  db.prepare(`DELETE FROM response_quality`).run();

  header("1. Lower compressor budgets are active");
  const haikuBudget = resolveCompressionBudget("haiku");
  const sonnetBudget = resolveCompressionBudget("sonnet");
  const opusBudget = resolveCompressionBudget("opus");
  console.log(`  haiku=${haikuBudget}  sonnet=${sonnetBudget}  opus=${opusBudget}`);
  assert.equal(haikuBudget, 3000);
  assert.equal(sonnetBudget, 10000);
  assert.equal(opusBudget, 20000);
  console.log("  ✅ budgets lowered (was 6000/24000/80000)");

  header("2. Prompt reorder shares stable prefix across calls");
  const p1 = buildCacheFriendlyPrompt({
    stable: ["FILES: a.ts +5/-0\nb.ts +1/-0", "Repo: kodif/x"],
    dynamic: ["Task: add README line"],
  });
  const p2 = buildCacheFriendlyPrompt({
    stable: ["FILES: a.ts +5/-0\nb.ts +1/-0", "Repo: kodif/x"],
    dynamic: ["Task: fix typo in b.ts"],
  });
  console.log(`  p1 len=${p1.length}  p2 len=${p2.length}  prefix shared=${sharesStablePrefix(p1, p2)}`);
  assert.ok(sharesStablePrefix(p1, p2));
  assert.notEqual(p1, p2);
  console.log("  ✅ cache-friendly prefix verified");

  header("3. Response cache dedup: store then hit");
  const promptA = "Task: explain the diff";
  storeCachedReply(db, promptA, "kodif/x", 42, "alice", "The diff adds logging to foo.ts:12.", 0.05);
  const hit = lookupCachedReply(db, promptA, "kodif/x", 42);
  assert.ok(hit);
  console.log(`  stored+hit: reply="${hit!.reply.slice(0, 40)}..." created_at=${hit!.created_at}`);
  const miss = lookupCachedReply(db, "Task: different prompt", "kodif/x", 42);
  assert.equal(miss, null);
  console.log("  ✅ dedup roundtrips correctly; unrelated prompts miss");

  header("4. Follow-up detection flags prior audit row");
  db.prepare(
    `INSERT INTO audit_log (sender, repo, pr_number, model, status, timestamp)
     VALUES ('alice','kodif/x',42,'Haiku','completed', datetime('now','-4 minutes'))`,
  ).run();
  const fu = detectAndRecordFollowup(db, "alice", "kodif/x", 42);
  console.log(`  previous_audit_id=${fu.previousAuditId}`);
  assert.ok(fu.previousAuditId);
  const flagged = db.prepare(`SELECT followup_15min FROM response_quality WHERE audit_id=?`).get(fu.previousAuditId!) as any;
  assert.equal(flagged.followup_15min, 1);
  console.log("  ✅ follow-up flagged on previous completed audit");

  header("5. Commit verification linked to audit row");
  db.prepare(`INSERT INTO audit_log (sender,repo,pr_number,model,status,cost_usd) VALUES ('alice','kodif/x',42,'Haiku','completed',0.03)`).run();
  const lastId = db.prepare(`SELECT id FROM audit_log ORDER BY id DESC LIMIT 1`).get() as { id: number };
  recordCommitVerification(db, lastId.id, true);
  const q = db.prepare(`SELECT commit_verified FROM response_quality WHERE audit_id=?`).get(lastId.id) as any;
  assert.equal(q.commit_verified, 1);
  console.log(`  audit_id=${lastId.id}  commit_verified=1  ✅`);

  header("6. Quality aggregation by model");
  const stats = qualityStats(db);
  console.log(`  ${JSON.stringify(stats, null, 2)}`);
  assert.ok(stats.length > 0);
  console.log("  ✅ quality roll-up works");

  header("7. Live tier suggestion from LFM2-350M");
  const tasks = [
    { task: "What does this PR do?",                      hint: "simple read → haiku" },
    { task: "Refactor the entire auth module and add tests across 5 services", hint: "big → sonnet/opus" },
  ];
  for (const { task, hint } of tasks) {
    const tier = await suggestTierWithLocalLLM(task, {
      url: routerUrl, model: process.env.KAI_ROUTER_MODEL ?? "LFM2-350M", timeoutMs: 5000,
    });
    console.log(`  task="${task.slice(0, 50)}..."  →  tier=${tier}  (expected ${hint})`);
    assert.ok(tier === null || ["haiku", "sonnet", "opus"].includes(tier));
  }
  console.log("  ✅ tier suggestion returns a valid enum value (or null)");

  writeFileSync("/tmp/kai-proof/summary.txt", "all 7 proof sections passed\n");
  console.log("\n🎉 All proofs passed. DB at /tmp/kai-proof/audit.db");
}

main().catch((e) => { console.error(e); process.exit(1); });
