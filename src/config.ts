export type Config = {
  auditDbPath: string;
  rateLimitSenderPerHour: number;
  rateLimitRepoPerHour: number;
  rateLimitSenderCostPerDay: number;
  allowlistDefaultTier: string;
  maxCostUsdHaiku: number;
  maxCostUsdSonnet: number;
  maxCostUsdOpus: number;
  maxPromptTokens: number;
  shortAnswerMaxInputTokens: number;
  routerUrl: string;
  routerModel: string;
  compressorUrl: string;
  compressorModel: string;
  compressorTimeoutMs: number;
  compressorMinQueryTokens: number;
  compressorMinPromptTokens: number;
  compressorBudgetHaiku: number;
  compressorBudgetSonnet: number;
  compressorBudgetOpus: number;
  routerHfRepo: string;
  routerGguf: string;
  routerMinBytes: number;
  compressorHfRepo: string;
  compressorGguf: string;
  compressorMinBytes: number;
  runnerAllowNoToken: boolean;
  runnerToken?: string;
  routerGitContext?: string;
  fileFocusModel: string;
  routerTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
};

function env(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required env: ${name}`);
  return value.trim();
}

function optEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function num(name: string, min: number, max: number): number {
  const raw = env(name);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Invalid number for ${name}: ${raw}`);
  if (value < min || value > max) throw new Error(`${name} out of range: ${value} not in [${min}, ${max}]`);
  return value;
}

function bool(name: string): boolean {
  const raw = env(name).toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Invalid boolean for ${name}: ${raw}`);
}

function tier(name: string): string {
  const raw = env(name).toLowerCase();
  if (raw === "haiku" || raw === "sonnet" || raw === "opus") return raw;
  throw new Error(`Invalid tier for ${name}: ${raw}`);
}

function logLevel(name: string): "debug" | "info" | "warn" | "error" {
  const raw = env(name).toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  throw new Error(`Invalid log level for ${name}: ${raw}`);
}

export function loadConfig(): Config {
  const runnerAllowNoToken = bool("KAI_RUNNER_ALLOW_NO_TOKEN");
  const runnerToken = optEnv("RUNNER_TOKEN");
  if (!runnerAllowNoToken && !runnerToken) {
    throw new Error("RUNNER_TOKEN is required unless KAI_RUNNER_ALLOW_NO_TOKEN=true");
  }
  return {
    auditDbPath: env("KAI_AUDIT_DB"),
    rateLimitSenderPerHour: num("KAI_RATE_LIMIT_SENDER_PER_HOUR", 1, 10_000),
    rateLimitRepoPerHour: num("KAI_RATE_LIMIT_REPO_PER_HOUR", 1, 100_000),
    rateLimitSenderCostPerDay: num("KAI_RATE_LIMIT_SENDER_COST_PER_DAY", 0, 1_000_000),
    allowlistDefaultTier: tier("KAI_ALLOWLIST_DEFAULT_TIER"),
    maxCostUsdHaiku: num("KAI_MAX_COST_USD_HAIKU", 0, 1000),
    maxCostUsdSonnet: num("KAI_MAX_COST_USD_SONNET", 0, 1000),
    maxCostUsdOpus: num("KAI_MAX_COST_USD_OPUS", 0, 1000),
    maxPromptTokens: num("KAI_MAX_PROMPT_TOKENS", 1, 1_000_000),
    shortAnswerMaxInputTokens: num("KAI_SHORT_ANSWER_MAX_INPUT_TOKENS", 1, 1_000_000),
    routerUrl: env("KAI_ROUTER_URL"),
    routerModel: env("KAI_ROUTER_MODEL"),
    compressorUrl: env("KAI_COMPRESSOR_URL"),
    compressorModel: env("KAI_COMPRESSOR_MODEL"),
    compressorTimeoutMs: num("KAI_COMPRESSOR_TIMEOUT_MS", 1, 120_000),
    compressorMinQueryTokens: num("KAI_COMPRESSOR_MIN_QUERY_TOKENS", 0, 1_000_000),
    compressorMinPromptTokens: num("KAI_COMPRESSOR_MIN_PROMPT_TOKENS", 0, 1_000_000),
    compressorBudgetHaiku: num("KAI_COMPRESSOR_BUDGET_HAIKU", 0, 1_000_000),
    compressorBudgetSonnet: num("KAI_COMPRESSOR_BUDGET_SONNET", 0, 1_000_000),
    compressorBudgetOpus: num("KAI_COMPRESSOR_BUDGET_OPUS", 0, 1_000_000),
    routerHfRepo: env("KAI_ROUTER_HF_REPO"),
    routerGguf: env("KAI_ROUTER_GGUF"),
    routerMinBytes: num("KAI_ROUTER_MIN_BYTES", 1, 10_000_000_000),
    compressorHfRepo: env("KAI_COMPRESSOR_HF_REPO"),
    compressorGguf: env("KAI_COMPRESSOR_GGUF"),
    compressorMinBytes: num("KAI_COMPRESSOR_MIN_BYTES", 1, 10_000_000_000),
    runnerAllowNoToken,
    runnerToken,
    routerGitContext: env("KAI_ROUTER_GIT_CONTEXT"),
    fileFocusModel: env("KAI_FILE_FOCUS_MODEL"),
    routerTimeoutMs: num("KAI_ROUTER_TIMEOUT_MS", 1, 120_000),
    logLevel: logLevel("KAI_LOG_LEVEL"),
  };
}
