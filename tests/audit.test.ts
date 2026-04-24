import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import { auditLog, checkRateLimit, initAuditDb, logRouterDecision, recordRateLimit, upsertSession } from "../dist/audit.js";

test("rate limit can enforce frequency without blocking zero-cost local lookup on daily budget", () => {
  const dbPath = join(tmpdir(), `kai-audit-${Date.now()}.db`);
  const db = initAuditDb(dbPath);
  try {
    recordRateLimit(db, "alice", "owner/repo", "haiku", 1);

    assert.equal(checkRateLimit(db, "alice", "owner/repo").allowed, false);
    assert.deepEqual(
      checkRateLimit(db, "alice", "owner/repo", { includeCostBudget: false }),
      { allowed: true },
    );
  } finally {
    db.close();
    rmSync(dbPath, { force: true });
  }
});

test("frequency limits still apply when cost budget is skipped", () => {
  const dbPath = join(tmpdir(), `kai-audit-${Date.now()}.db`);
  const db = initAuditDb(dbPath);
  try {
    for (let i = 0; i < 20; i++) {
      recordRateLimit(db, "alice", "owner/repo", "local-repo-lookup", 0);
    }

    const result = checkRateLimit(db, "alice", "owner/repo", { includeCostBudget: false });
    assert.equal(result.allowed, false);
    assert.match(result.reason ?? "", /sender rate limit/);
  } finally {
    db.close();
    rmSync(dbPath, { force: true });
  }
});

test("audit, router, and session rows preserve repo and thread identity", () => {
  const dbPath = join(tmpdir(), `kai-audit-${Date.now()}.db`);
  const db = initAuditDb(dbPath);
  try {
    const thread = {
      repo: "er-zhi/ai_test",
      prNumber: 4,
      eventName: "issue_comment",
      threadKind: "pull_request",
      threadId: 4,
      commentId: 4310842409,
      sender: "alice",
    };

    auditLog(db, { ...thread, model: "LFM2-350M", message: "fix this", status: "started" });
    logRouterDecision(db, {
      ...thread,
      route: {
        intent: "write-fix",
        decision: "call-model",
        confidence: 0.9,
        modelTier: "small-local",
        estimatedTokens: 64,
        estimatedCostUsd: 0,
        reason: "test",
      },
    });
    upsertSession(db, {
      runId: "24873537506-1-4310842409",
      ...thread,
      model: "LFM2-350M",
      replyCommentId: 999,
      phase: "accepted",
      status: "completed",
    });

    const audit = { ...db.prepare(`
      SELECT repo, pr_number, event_name, thread_kind, thread_id, comment_id
      FROM audit_log
    `).get() as Record<string, unknown> };
    assert.deepEqual(audit, {
      repo: "er-zhi/ai_test",
      pr_number: 4,
      event_name: "issue_comment",
      thread_kind: "pull_request",
      thread_id: 4,
      comment_id: 4310842409,
    });

    const session = { ...db.prepare(`
      SELECT repo, pr_number, event_name, thread_kind, thread_id, comment_id, reply_comment_id
      FROM sessions
    `).get() as Record<string, unknown> };
    assert.deepEqual(session, {
      repo: "er-zhi/ai_test",
      pr_number: 4,
      event_name: "issue_comment",
      thread_kind: "pull_request",
      thread_id: 4,
      comment_id: 4310842409,
      reply_comment_id: 999,
    });
  } finally {
    db.close();
    rmSync(dbPath, { force: true });
  }
});
