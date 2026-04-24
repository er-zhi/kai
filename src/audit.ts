import * as core from "@actions/core";
import { DatabaseSync } from "node:sqlite";
import type { RouterDecision } from "./types";

export type RateLimitCheck = { allowed: boolean; reason?: string };
export type RateLimitOptions = { includeCostBudget?: boolean };

export type AuditDb = DatabaseSync;

export type AuditLogInput = {
  sender: string;
  repo: string;
  prNumber: number;
  eventName?: string;
  threadKind?: string;
  threadId?: number;
  commentId?: number;
  model: string;
  message?: string;
  durationMs?: number;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  rtkSavings?: string;
  status?: string;
  error?: string;
};

export type RouterDecisionLogInput = {
  repo: string;
  prNumber: number;
  eventName?: string;
  threadKind?: string;
  threadId?: number;
  commentId: number;
  sender: string;
  route: RouterDecision;
};

export type SessionInput = {
  runId: string;
  repo: string;
  prNumber: number;
  eventName: string;
  threadKind: string;
  threadId: number;
  sender: string;
  commentId: number;
  replyCommentId?: number | null;
  model: string;
  phase?: string;
  status?: string;
};

const DEFAULT_RATE_LIMIT_SENDER_PER_HOUR = 20;
const DEFAULT_RATE_LIMIT_REPO_PER_HOUR = 100;
const DEFAULT_RATE_LIMIT_SENDER_COST_PER_DAY = 0.25;

export function initAuditDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      sender TEXT NOT NULL,
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      event_name TEXT NOT NULL DEFAULT 'unknown',
      thread_kind TEXT NOT NULL DEFAULT 'unknown',
      thread_id INTEGER,
      comment_id INTEGER,
      model TEXT NOT NULL,
      message TEXT,
      duration_ms INTEGER,
      cost_usd REAL,
      tokens_in INTEGER,
      tokens_out INTEGER,
      rtk_savings TEXT,
      status TEXT DEFAULT 'started',
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT UNIQUE NOT NULL,
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      event_name TEXT NOT NULL DEFAULT 'unknown',
      thread_kind TEXT NOT NULL DEFAULT 'unknown',
      thread_id INTEGER,
      sender TEXT NOT NULL,
      comment_id INTEGER NOT NULL,
      reply_comment_id INTEGER,
      model TEXT NOT NULL,
      phase TEXT DEFAULT 'init',
      attempt INTEGER DEFAULT 1,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_heartbeat TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT DEFAULT 'running',
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS router_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      event_name TEXT NOT NULL DEFAULT 'unknown',
      thread_kind TEXT NOT NULL DEFAULT 'unknown',
      thread_id INTEGER,
      comment_id INTEGER NOT NULL,
      sender TEXT NOT NULL,
      intent TEXT NOT NULL,
      decision TEXT NOT NULL,
      confidence REAL NOT NULL,
      model_tier TEXT NOT NULL,
      estimated_tokens INTEGER NOT NULL,
      estimated_cost_usd REAL NOT NULL,
      reason TEXT
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      sender TEXT NOT NULL,
      repo TEXT NOT NULL,
      tier TEXT NOT NULL,
      cost_usd REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limits_sender_ts ON rate_limits(sender, timestamp);
    CREATE INDEX IF NOT EXISTS idx_rate_limits_repo_ts ON rate_limits(repo, timestamp)
  `);
  ensureColumn(db, "audit_log", "event_name", "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, "audit_log", "thread_kind", "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, "audit_log", "thread_id", "INTEGER");
  ensureColumn(db, "audit_log", "comment_id", "INTEGER");
  ensureColumn(db, "sessions", "event_name", "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, "sessions", "thread_kind", "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, "sessions", "thread_id", "INTEGER");
  ensureColumn(db, "router_decisions", "event_name", "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, "router_decisions", "thread_kind", "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, "router_decisions", "thread_id", "INTEGER");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_thread ON audit_log(repo, thread_kind, thread_id, comment_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_thread ON sessions(repo, thread_kind, thread_id, comment_id);
    CREATE INDEX IF NOT EXISTS idx_router_decisions_thread ON router_decisions(repo, thread_kind, thread_id, comment_id);
  `);
  return db;
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function checkRateLimit(
  db: DatabaseSync | null,
  sender: string,
  repoFull: string,
  options: RateLimitOptions = {},
): RateLimitCheck {
  const senderPerHour = DEFAULT_RATE_LIMIT_SENDER_PER_HOUR;
  const repoPerHour = DEFAULT_RATE_LIMIT_REPO_PER_HOUR;
  const senderCostPerDay = DEFAULT_RATE_LIMIT_SENDER_COST_PER_DAY;
  const includeCostBudget = options.includeCostBudget ?? true;
  if (!db) return { allowed: false, reason: "rate-limit database unavailable" };
  try {
    const hourly = db.prepare(
      `SELECT COUNT(*) AS n FROM rate_limits WHERE sender = ? AND timestamp >= datetime('now', '-1 hour')`,
    ).get(sender) as { n: number };
    if (hourly.n >= senderPerHour) {
      return { allowed: false, reason: `sender rate limit: ${hourly.n}/${senderPerHour} calls in last hour` };
    }
    const repoHourly = db.prepare(
      `SELECT COUNT(*) AS n FROM rate_limits WHERE repo = ? AND timestamp >= datetime('now', '-1 hour')`,
    ).get(repoFull) as { n: number };
    if (repoHourly.n >= repoPerHour) {
      return { allowed: false, reason: `repo rate limit: ${repoHourly.n}/${repoPerHour} calls in last hour` };
    }
    if (includeCostBudget) {
      const dailyCost = db.prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) AS c FROM rate_limits WHERE sender = ? AND timestamp >= datetime('now', '-1 day')`,
      ).get(sender) as { c: number };
      if (dailyCost.c >= senderCostPerDay) {
        return { allowed: false, reason: `sender daily budget: $${dailyCost.c.toFixed(2)}/$${senderCostPerDay}` };
      }
    }
    return { allowed: true };
  } catch (e) {
    core.warning(`Rate-limit check failed: ${e}`);
    return { allowed: false, reason: "rate-limit check failed" };
  }
}

export function recordRateLimit(db: DatabaseSync | null, sender: string, repoFull: string, tier: string, costUsd: number): void {
  if (!db) return;
  try {
    db.prepare(`INSERT INTO rate_limits (sender, repo, tier, cost_usd) VALUES (?, ?, ?, ?)`)
      .run(sender, repoFull, tier, costUsd);
  } catch (e) { core.warning(`Rate-limit record failed: ${e}`); }
}

export function auditLog(db: DatabaseSync, data: AuditLogInput): void {
  try {
    db.prepare(`
      INSERT INTO audit_log (sender, repo, pr_number, event_name, thread_kind, thread_id, comment_id, model, message, duration_ms, cost_usd, tokens_in, tokens_out, rtk_savings, status, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.sender, data.repo, data.prNumber,
      data.eventName ?? "unknown", data.threadKind ?? "unknown", data.threadId ?? null, data.commentId ?? null,
      data.model,
      data.message ?? null, data.durationMs ?? null, data.costUsd ?? null,
      data.tokensIn ?? null, data.tokensOut ?? null, data.rtkSavings ?? null,
      data.status ?? "started", data.error ?? null,
    );
  } catch (e) {
    core.warning(`Audit log failed: ${e}`);
  }
}

export function logRouterDecision(db: DatabaseSync, data: RouterDecisionLogInput): void {
  try {
    db.prepare(`
      INSERT INTO router_decisions (repo, pr_number, event_name, thread_kind, thread_id, comment_id, sender, intent, decision, confidence, model_tier, estimated_tokens, estimated_cost_usd, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.repo, data.prNumber, data.eventName ?? "unknown", data.threadKind ?? "unknown", data.threadId ?? null,
      data.commentId, data.sender,
      data.route.intent, data.route.decision, data.route.confidence,
      data.route.modelTier, data.route.estimatedTokens, data.route.estimatedCostUsd,
      data.route.reason,
    );
  } catch (e) {
    core.warning(`Router decision log failed: ${e}`);
  }
}

export function upsertSession(db: DatabaseSync, data: SessionInput): void {
  try {
    db.prepare(`
      INSERT INTO sessions (
        run_id, repo, pr_number, event_name, thread_kind, thread_id, sender,
        comment_id, reply_comment_id, model, phase, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        repo = excluded.repo,
        pr_number = excluded.pr_number,
        event_name = excluded.event_name,
        thread_kind = excluded.thread_kind,
        thread_id = excluded.thread_id,
        sender = excluded.sender,
        comment_id = excluded.comment_id,
        reply_comment_id = excluded.reply_comment_id,
        model = excluded.model,
        phase = excluded.phase,
        status = excluded.status,
        last_heartbeat = datetime('now')
    `).run(
      data.runId, data.repo, data.prNumber, data.eventName, data.threadKind,
      data.threadId, data.sender, data.commentId, data.replyCommentId ?? null,
      data.model, data.phase ?? "init", data.status ?? "running",
    );
  } catch (e) {
    core.warning(`Session upsert failed: ${e}`);
  }
}
