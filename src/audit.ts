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
  commentId: number;
  sender: string;
  route: RouterDecision;
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
  return db;
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
      INSERT INTO audit_log (sender, repo, pr_number, model, message, duration_ms, cost_usd, tokens_in, tokens_out, rtk_savings, status, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.sender, data.repo, data.prNumber, data.model,
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
      INSERT INTO router_decisions (repo, pr_number, comment_id, sender, intent, decision, confidence, model_tier, estimated_tokens, estimated_cost_usd, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.repo, data.prNumber, data.commentId, data.sender,
      data.route.intent, data.route.decision, data.route.confidence,
      data.route.modelTier, data.route.estimatedTokens, data.route.estimatedCostUsd,
      data.route.reason,
    );
  } catch (e) {
    core.warning(`Router decision log failed: ${e}`);
  }
}
