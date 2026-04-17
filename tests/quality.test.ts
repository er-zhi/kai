import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  ensureQualitySchema,
  recordCommitVerification,
  recordCacheHit,
  recordGroundedScore,
  detectAndRecordFollowup,
  qualityStats,
} from "../dist/quality.js";

function setup(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  // audit_log shape mirrors production schema (subset needed for joins).
  db.exec(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      sender TEXT NOT NULL, repo TEXT NOT NULL, pr_number INTEGER NOT NULL,
      model TEXT NOT NULL, status TEXT NOT NULL, cost_usd REAL NOT NULL DEFAULT 0
    );
  `);
  ensureQualitySchema(db);
  return db;
}

test("upsert is idempotent and overlays columns", () => {
  const db = setup();
  db.prepare(`INSERT INTO audit_log (sender,repo,pr_number,model,status,cost_usd) VALUES ('a','o/r',1,'Haiku','completed',0.01)`).run();
  recordCacheHit(db, 1);
  recordCommitVerification(db, 1, true);
  recordGroundedScore(db, 1, 77);
  const row = db.prepare(`SELECT * FROM response_quality WHERE audit_id=1`).get() as any;
  assert.equal(row.cache_hit, 1);
  assert.equal(row.commit_verified, 1);
  assert.equal(row.llm_grounded_score, 77);
});

test("recordGroundedScore clamps to 0..100", () => {
  const db = setup();
  db.prepare(`INSERT INTO audit_log (sender,repo,pr_number,model,status) VALUES ('a','o/r',1,'Haiku','completed')`).run();
  recordGroundedScore(db, 1, 900);
  recordGroundedScore(db, 1, -5);
  const row = db.prepare(`SELECT llm_grounded_score FROM response_quality WHERE audit_id=1`).get() as any;
  assert.equal(row.llm_grounded_score, 0);
});

test("followup detection flags previous audit within 15 min window", () => {
  const db = setup();
  // Previous completed run, 5 min ago.
  db.prepare(
    `INSERT INTO audit_log (sender,repo,pr_number,model,status,timestamp)
     VALUES ('alice','o/r',3,'Haiku','completed', datetime('now','-5 minutes'))`,
  ).run();
  const { previousAuditId } = detectAndRecordFollowup(db, "alice", "o/r", 3);
  assert.ok(previousAuditId);
  const row = db.prepare(`SELECT followup_15min FROM response_quality WHERE audit_id=?`).get(previousAuditId!) as any;
  assert.equal(row.followup_15min, 1);
});

test("followup detection ignores old or different-sender runs", () => {
  const db = setup();
  db.prepare(
    `INSERT INTO audit_log (sender,repo,pr_number,model,status,timestamp)
     VALUES ('alice','o/r',3,'Haiku','completed', datetime('now','-30 minutes'))`,
  ).run();
  db.prepare(
    `INSERT INTO audit_log (sender,repo,pr_number,model,status,timestamp)
     VALUES ('bob','o/r',3,'Haiku','completed', datetime('now','-2 minutes'))`,
  ).run();
  const res = detectAndRecordFollowup(db, "alice", "o/r", 3);
  assert.equal(res.previousAuditId, null);
});

test("qualityStats aggregates by model", () => {
  const db = setup();
  db.prepare(`INSERT INTO audit_log (sender,repo,pr_number,model,status,cost_usd) VALUES ('a','o/r',1,'Haiku','completed',0.01)`).run();
  db.prepare(`INSERT INTO audit_log (sender,repo,pr_number,model,status,cost_usd) VALUES ('a','o/r',2,'Haiku','completed',0.03)`).run();
  db.prepare(`INSERT INTO audit_log (sender,repo,pr_number,model,status,cost_usd) VALUES ('a','o/r',3,'Sonnet','completed-rtk-bypass',0.20)`).run();
  recordGroundedScore(db, 1, 80);
  recordGroundedScore(db, 2, 90);
  const rows = qualityStats(db);
  const byModel = Object.fromEntries(rows.map((r) => [r.model, r]));
  assert.equal(byModel.Haiku.n, 2);
  assert.equal(byModel.Sonnet.n, 1);
  assert.equal(Math.round(byModel.Haiku.grounded_avg! as number), 85);
});
