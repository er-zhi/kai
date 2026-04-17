// Reorders prompt sections so the stable prefix stays identical across calls.
// Anthropic prompt caching matches by exact prefix — if "task" varies first,
// cache never hits. Moving stable context (arch docs, repo meta, file list) to
// the top makes the cache hit reliable.

export type PromptSections = {
  stable: string[];
  dynamic: string[];
};

export function buildCacheFriendlyPrompt(sections: PromptSections): string {
  const stable = sections.stable.map((s) => s.trim()).filter(Boolean);
  const dynamic = sections.dynamic.map((s) => s.trim()).filter(Boolean);
  const parts: string[] = [];
  if (stable.length) {
    parts.push("=== STABLE CONTEXT (cache prefix) ===");
    parts.push(...stable);
  }
  if (dynamic.length) {
    parts.push("=== TASK ===");
    parts.push(...dynamic);
  }
  return parts.join("\n\n").trim();
}

// Detects whether a stable prefix was preserved when comparing two prompts —
// useful for tests that prove cache friendliness.
export function sharesStablePrefix(a: string, b: string): boolean {
  const aStable = a.split("=== TASK ===")[0];
  const bStable = b.split("=== TASK ===")[0];
  return aStable.length > 0 && aStable === bStable;
}
