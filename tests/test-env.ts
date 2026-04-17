import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

export function applyTestEnv(file = ".env.test"): void {
  const path = resolve(process.cwd(), file);
  const env = parseEnv(readFileSync(path, "utf8"));
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
}
