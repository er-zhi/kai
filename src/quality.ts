import type { DatabaseSync } from "node:sqlite";

export function ensureQualitySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS response_quality (
      audit_id INTEGER PRIMARY KEY,
      reactions_pos INTEGER DEFAULT 0,
      reactions_neg INTEGER DEFAULT 0,
      followup_15min INTEGER DEFAULT 0,
      commit_verified INTEGER,
      llm_grounded_score INTEGER,
      cache_hit INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_quality_updated ON response_quality(updated_at);
  `);
}

function upsert(db: DatabaseSync, auditId: number, column: string, value: number): void {
  db.prepare(
    `INSERT INTO response_quality (audit_id, ${column}) VALUES (?, ?)
     ON CONFLICT(audit_id) DO UPDATE SET ${column} = excluded.${column}, updated_at = datetime('now')`,
  ).run(auditId, value);
}

export function recordCommitVerification(db: DatabaseSync, auditId: number, verified: boolean): void {
  upsert(db, auditId, "commit_verified", verified ? 1 : 0);
}

export function recordCacheHit(db: DatabaseSync, auditId: number): void {
  upsert(db, auditId, "cache_hit", 1);
}

export function recordGroundedScore(db: DatabaseSync, auditId: number, score: number): void {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  upsert(db, auditId, "llm_grounded_score", clamped);
}

// A follow-up means the same sender re-pinged Kai on the same PR within 15 min
// of the previous completed run — a signal the prior answer didn't satisfy.
export function detectAndRecordFollowup(
  db: DatabaseSync, sender: string, repo: string, prNumber: number,
): { previousAuditId: number | null } {
  const row = db.prepare(
    `SELECT id FROM audit_log
     WHERE sender = ? AND repo = ? AND pr_number = ?
       AND status IN ('completed','completed-rtk-bypass','completed-cost-over-cap')
       AND timestamp >= datetime('now', '-15 minutes')
       AND timestamp < datetime('now', '-5 seconds')
     ORDER BY timestamp DESC LIMIT 1`,
  ).get(sender, repo, prNumber) as { id?: number } | undefined;
  if (!row?.id) return { previousAuditId: null };
  upsert(db, row.id, "followup_15min", 1);
  return { previousAuditId: row.id };
}

export type QualityStatRow = {
  model: string;
  n: number;
  avg_cost: number;
  followup_rate: number;
  grounded_avg: number | null;
  commit_success_rate: number | null;
};

export function qualityStats(db: DatabaseSync): QualityStatRow[] {
  return db.prepare(
    `SELECT a.model,
            COUNT(*) AS n,
            AVG(a.cost_usd) AS avg_cost,
            COALESCE(AVG(q.followup_15min), 0) AS followup_rate,
            AVG(q.llm_grounded_score) AS grounded_avg,
            AVG(q.commit_verified) AS commit_success_rate
     FROM audit_log a
     LEFT JOIN response_quality q ON q.audit_id = a.id
     WHERE a.status LIKE 'completed%'
     GROUP BY a.model`,
  ).all() as QualityStatRow[];
}
