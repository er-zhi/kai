import { LogLevel, parseLogLevel } from "./log";

export type Config = {
  routerUrl: string | null;
  auditDbPath: string;
  routerTimeoutMs: number;
  logLevel: LogLevel;
};

const ROUTER_TIMEOUT_MS = 5_000;

function env(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required env: ${name}`);
  return value.trim();
}

function optEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

export function loadConfig(): Config {
  return {
    routerUrl: optEnv("KAI_ROUTER_URL"),
    auditDbPath: env("KAI_AUDIT_DB"),
    routerTimeoutMs: ROUTER_TIMEOUT_MS,
    logLevel: parseLogLevel(env("KAI_LOG_LEVEL")),
  };
}
