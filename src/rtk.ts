// Sentinel for cases where RTK did not run or its output could not be parsed.
// Distinct from "0.0%" which means RTK ran and measured zero savings (bypass).
export const RTK_NOT_TRACKED = "n/a";

export function parseRtkSavings(raw: string): string {
  const text = raw.trim();
  if (!text) return RTK_NOT_TRACKED;
  const percentMatches = [
    text.match(/\((\d+(?:\.\d+)?)%\)/),
    text.match(/(?:savings?|saved|gain|improvement|reduction)\D+(\d+(?:\.\d+)?)%/i),
    text.match(/\b(\d+(?:\.\d+)?)%\b/),
  ].filter((m): m is RegExpMatchArray => !!m);
  if (percentMatches.length) return `${percentMatches[0][1]}%`;
  const decimalMatch = text.match(/\b0\.(\d+)\b/);
  if (decimalMatch) {
    const pct = Number(`0.${decimalMatch[1]}`) * 100;
    if (Number.isFinite(pct) && pct > 0) return `${pct.toFixed(1)}%`;
  }
  return RTK_NOT_TRACKED;
}
