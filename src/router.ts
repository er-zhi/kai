export type RouterIntent =
  | "ignore" | "stop" | "meta-template" | "needs-input" | "simple-answer"
  | "review" | "write-fix" | "commit-write" | "job-candidate"
  | "alert" | "spam-abuse" | "unsupported";

export type RouterDecision = {
  intent: RouterIntent;
  decision: "ignore" | "stop" | "reply-template" | "ask-clarification" | "call-model";
  confidence: number;
  modelTier: string;
  estimatedTokens: number;
  estimatedCostUsd: number;
  reason: string;
  normalizedMessage: string;
  maxContextTokens: number;
  commitExpected: boolean;
  source?: "rules" | "local-llm";
};

const OFFTOPIC_PATTERNS = [
  /\b(weather|recipe|movie|music|song|joke|dating|sports|football|basketball|crypto price|stock price)\b/i,
  /\b(погода|рецепт|фильм|музыка|песня|шутк|спорт|футбол|баскетбол|крипт|акци[яи])\b/i,
];

export function isMetaQuestion(msg: string): boolean {
  return /^(who are you|what are you|how to use|help|what can you do|кто ты|как пользоваться)/i.test(msg);
}

export function shouldVerifyCommit(message: string): boolean {
  if (/\b(commit|push)\b/i.test(message)) return true;

  const trimmed = message.trim();
  const isQuestion = /\?$/.test(trimmed) || /^(can|could|should|would|is|are|do|does|what|who|why|how)\b/i.test(trimmed);
  if (isQuestion) return false;

  return /\b(fix|add|update|create|patch|refactor|write|change|remove|delete|document|documentation|doc)\b/i.test(trimmed);
}

export function normalizeWhitespace(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

function estimateTokensFromChars(text: string): number {
  return Math.ceil(text.length / 4);
}

export function routeEvent(rawMessage: string, modelTier: string): RouterDecision {
  const normalized = normalizeWhitespace(rawMessage);

  const base = (intent: RouterIntent, decision: RouterDecision["decision"], reason: string, confidence = 0.95): RouterDecision => ({
    intent, decision, confidence, modelTier,
    estimatedTokens: estimateTokensFromChars(normalized),
    estimatedCostUsd: 0,
    reason,
    normalizedMessage: normalized,
    maxContextTokens: 10_000,
    commitExpected: false,
    source: "rules",
  });

  if (!normalized) {
    return { ...base("needs-input", "ask-clarification", "empty mention", 0.99), maxContextTokens: 0 };
  }

  if (/^(stop|cancel|abort|quit)\b/i.test(normalized)) {
    return { ...base("stop", "stop", "global stop command", 1), maxContextTokens: 0 };
  }

  if (isMetaQuestion(normalized)) {
    return { ...base("meta-template", "reply-template", "meta question handled by template", 0.99), maxContextTokens: 0 };
  }

  if (OFFTOPIC_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { ...base("spam-abuse", "reply-template", "off-topic non-development request", 0.9), maxContextTokens: 0 };
  }

  if (/https?:\/\/\S+\s*$/i.test(normalized) && normalized.split(" ").length <= 3) {
    return { ...base("needs-input", "ask-clarification", "link-only request needs task", 0.9), maxContextTokens: 0 };
  }

  if (/^(fix|do|handle|improve|make better|review everything|check everything)$/i.test(normalized)) {
    return { ...base("needs-input", "ask-clarification", "task too vague", 0.86), maxContextTokens: 0 };
  }

  if (/\b(job|super|sudo|su)\b/i.test(normalized)) {
    return { ...base("job-candidate", "call-model", "stateful job candidate", 0.82), maxContextTokens: 20_000 };
  }

  const commitExpected = shouldVerifyCommit(normalized);
  if (commitExpected) {
    const intent: RouterIntent = /\b(commit|push)\b/i.test(normalized) ? "commit-write" : "write-fix";
    return {
      ...base(intent, "call-model", "imperative write task", 0.9),
      estimatedTokens: 20_000,
      estimatedCostUsd: modelTier === "haiku" ? 0.02 : modelTier === "sonnet" ? 0.12 : 0.5,
      maxContextTokens: 30_000,
      commitExpected: true,
    };
  }

  if (/\b(review|risk|security|issue|bug|remaining)\b/i.test(normalized)) {
    return {
      ...base("review", "call-model", "review or analysis request", 0.88),
      estimatedTokens: 40_000,
      estimatedCostUsd: modelTier === "haiku" ? 0.04 : modelTier === "sonnet" ? 0.2 : 0.8,
      maxContextTokens: 60_000,
    };
  }

  return {
    ...base("simple-answer", "call-model", "simple answer request", 0.78),
    estimatedTokens: 12_000,
    estimatedCostUsd: modelTier === "haiku" ? 0.01 : modelTier === "sonnet" ? 0.06 : 0.25,
    maxContextTokens: 15_000,
  };
}

const ROUTER_INTENTS: RouterIntent[] = [
  "ignore", "stop", "meta-template", "needs-input", "simple-answer",
  "review", "write-fix", "commit-write", "job-candidate",
  "alert", "spam-abuse", "unsupported",
];

const ROUTER_DECISIONS: RouterDecision["decision"][] = [
  "ignore", "stop", "reply-template", "ask-clarification", "call-model",
];

type LocalRouterPayload = {
  intent?: RouterIntent;
  decision?: RouterDecision["decision"];
  confidence?: number;
  reason?: string;
  maxContextTokens?: number;
  commitExpected?: boolean;
};

export class LocalRouterUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalRouterUnavailableError";
  }
}

function parseLocalRouterPayload(raw: string): LocalRouterPayload | null {
  try {
    const parsed = JSON.parse(raw) as LocalRouterPayload;
    if (!ROUTER_INTENTS.includes(parsed.intent as RouterIntent)) return null;
    if (!ROUTER_DECISIONS.includes(parsed.decision as RouterDecision["decision"])) return null;
    return parsed;
  } catch {
    return null;
  }
}

function localRouterPrompt(message: string): string {
  return [
    "Classify this GitHub PR comment for Kai, a development-only engineering bot.",
    "Return JSON only with keys: intent, decision, confidence, reason, maxContextTokens, commitExpected.",
    "Allowed intents: simple-answer, review, write-fix, commit-write, job-candidate, alert, spam-abuse, unsupported.",
    "Allowed decisions: reply-template, ask-clarification, call-model.",
    "Never return stop, ignore, meta-template, or needs-input. Those are handled before this classifier.",
    "Off-topic non-development requests must be spam-abuse + reply-template.",
    "Imperative development changes must be write-fix or commit-write + call-model + commitExpected true.",
    "Questions asking if something can/should be done should be simple-answer + call-model + commitExpected false.",
    `Comment: ${JSON.stringify(message)}`,
  ].join("\n");
}

export async function routeEventWithLocalLLM(
  rawMessage: string,
  modelTier: string,
  options?: { url?: string; model?: string; timeoutMs?: number; allowRulesOnly?: boolean },
): Promise<RouterDecision> {
  const rules = routeEvent(rawMessage, modelTier);

  // Hard control/no-token paths stay deterministic and never need an LLM.
  if (["stop", "meta-template", "needs-input", "spam-abuse"].includes(rules.intent)) return rules;

  const url = options?.url ?? process.env.KAI_ROUTER_URL;
  if (!url) {
    if (options?.allowRulesOnly) return rules;
    throw new LocalRouterUnavailableError("local router URL is required before paid model calls");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 1500);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: options?.model ?? process.env.KAI_ROUTER_MODEL ?? "gemma-4-E2B-it",
        messages: [{ role: "user", content: localRouterPrompt(rules.normalizedMessage) }],
        stream: false,
        temperature: 0,
        max_tokens: 160,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new LocalRouterUnavailableError(`local router returned HTTP ${res.status}`);
    }
    const body = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content ?? "";
    const local = parseLocalRouterPayload(content);
    if (!local) {
      throw new LocalRouterUnavailableError("local router returned invalid JSON classification");
    }

    return {
      ...rules,
      intent: local.intent as RouterIntent,
      decision: local.decision as RouterDecision["decision"],
      confidence: Math.max(0, Math.min(1, Number(local.confidence ?? 0.7))),
      reason: `local-llm: ${local.reason ?? "classified"}`,
      maxContextTokens: Number(local.maxContextTokens ?? rules.maxContextTokens),
      commitExpected: rules.commitExpected || Boolean(local.commitExpected),
      source: "local-llm",
    };
  } catch (error) {
    if (error instanceof LocalRouterUnavailableError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new LocalRouterUnavailableError(`local router request failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}
