import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export function ensureCacheSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS response_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_hash TEXT NOT NULL,
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      sender TEXT NOT NULL,
      reply TEXT NOT NULL,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cache_hash ON response_cache(prompt_hash, repo, pr_number);
    CREATE INDEX IF NOT EXISTS idx_cache_ts ON response_cache(created_at);
  `);
}

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 32);
}

export type CachedReply = { reply: string; created_at: string };

export function lookupCachedReply(
  db: DatabaseSync,
  prompt: string,
  repo: string,
  prNumber: number,
  ttlHours = 24,
): CachedReply | null {
  const hash = hashPrompt(prompt);
  const hours = Math.max(1, Math.floor(ttlHours));
  const row = db.prepare(
    `SELECT reply, created_at FROM response_cache
     WHERE prompt_hash = ? AND repo = ? AND pr_number = ?
       AND created_at >= datetime('now', '-${hours} hours')
     ORDER BY created_at DESC LIMIT 1`,
  ).get(hash, repo, prNumber) as CachedReply | undefined;
  return row ?? null;
}

export function storeCachedReply(
  db: DatabaseSync,
  prompt: string,
  repo: string,
  prNumber: number,
  sender: string,
  reply: string,
  costUsd: number,
): void {
  const hash = hashPrompt(prompt);
  db.prepare(
    `INSERT INTO response_cache (prompt_hash, repo, pr_number, sender, reply, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(hash, repo, prNumber, sender, reply, costUsd);
}
