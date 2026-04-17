function formatK(tokens: number): string {
  if (tokens <= 0) return "0";
  if (tokens < 1000) return "<1";
  return `${Math.round(tokens / 1000)}`;
}

// Passive display layer. Callers pass pre-formatted values from upstream
// trackers (rtk.ts, compressor.ts, runner.ts). This function does NOT compute,
// validate, or decide anything — business logic must read from source values,
// never by re-parsing the returned string.
//
// rtkSavings: "41.0%" (measured), "0.0%" (measured bypass), or "n/a" (not tracked).
// cmpSavings: "38%" (measured) or "0%" (skipped / no reduction).
export function buildFooter(
  modelLabel: string,
  rtkSavings: string,
  cmpSavings: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  numTurns: number,
  durationSec: number,
  cacheReadTokens = 0,
): string {
  const inK = formatK(inputTokens);
  const outK = formatK(outputTokens);
  const cachePct = inputTokens > 0 ? Math.round((cacheReadTokens / inputTokens) * 100) : 0;
  const cacheTag = cachePct > 0 ? ` · cache ${cachePct}%` : "";
  return `Kai · ${modelLabel} · [RTK](https://github.com/rtk-ai/rtk) ${rtkSavings} · CMP ${cmpSavings}${cacheTag} · ${inK}K in / ${outK}K out · $${costUsd.toFixed(4)} · ${numTurns}t · ${durationSec}s · deeper analysis: use sonnet / use opus`;
}

export function buildRouterFooter(routerModel: string, durationSec: number): string {
  return `Kai · local LLM (${routerModel}) · RTK 0% · cache 0% · 0 in / 0 out · $0 · 0t · ${durationSec}s · deeper analysis: unavailable`;
}
