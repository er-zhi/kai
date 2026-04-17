import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ensureCacheSchema, hashPrompt, lookupCachedReply, storeCachedReply } from "../dist/cache.js";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  ensureCacheSchema(db);
  return db;
}

test("hashPrompt is deterministic and content-sensitive", () => {
  assert.equal(hashPrompt("abc"), hashPrompt("abc"));
  assert.notEqual(hashPrompt("abc"), hashPrompt("abd"));
  assert.equal(hashPrompt("").length, 32);
});

test("lookup returns null when nothing cached", () => {
  const db = freshDb();
  assert.equal(lookupCachedReply(db, "prompt", "o/r", 1), null);
});

test("store then lookup round-trips for same prompt+pr", () => {
  const db = freshDb();
  storeCachedReply(db, "prompt-1", "o/r", 7, "alice", "THE ANSWER", 0.12);
  const hit = lookupCachedReply(db, "prompt-1", "o/r", 7);
  assert.ok(hit);
  assert.equal(hit.reply, "THE ANSWER");
});

test("lookup misses when prompt text differs", () => {
  const db = freshDb();
  storeCachedReply(db, "prompt-1", "o/r", 7, "alice", "X", 0);
  assert.equal(lookupCachedReply(db, "prompt-2", "o/r", 7), null);
});

test("lookup misses across PR numbers", () => {
  const db = freshDb();
  storeCachedReply(db, "prompt-1", "o/r", 7, "alice", "X", 0);
  assert.equal(lookupCachedReply(db, "prompt-1", "o/r", 8), null);
});

test("TTL excludes entries older than window", () => {
  const db = freshDb();
  db.prepare(
    `INSERT INTO response_cache (prompt_hash, repo, pr_number, sender, reply, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-48 hours'))`,
  ).run(hashPrompt("old-prompt"), "o/r", 7, "alice", "STALE", 0);
  assert.equal(lookupCachedReply(db, "old-prompt", "o/r", 7, 24), null);
  assert.ok(lookupCachedReply(db, "old-prompt", "o/r", 7, 72));
});
