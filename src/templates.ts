import type { RouterDecision } from "./router";

export const META_TEMPLATE = `I'm Kai, the Kodif project assistant. My goal is to help with minimal token spend and provide a good experience for Kodif architecture questions. Response by local LLM (LFM2-350M). Usage: write a comment with a task for @kai; for deeper analysis add \`use sonnet\` or \`use opus\`.`;

export const OFFTOPIC_TEMPLATE = `Kai only handles development work related to our platform: code review, bug fixes, tests, PRs, architecture, deployments, logs, metrics, and engineering tasks. Please ask a work-related development question or provide a specific repo/PR/task.`;

export const CLARIFICATION_TEMPLATE = `I'm not sure what you're asking. Can you clarify:

1. **Which service/component?** (e.g., "in the executor-service" or "in this PR")
2. **What kind of help?** (e.g., "fix this bug", "review this code", "suggest architecture")
3. **Scope?** (e.g., "in this repository" or "across all services")

Provide a specific task and I'll help with minimal token spend.`;

export function templateForRoute(route: RouterDecision): string {
  if (route.intent === "spam-abuse") return OFFTOPIC_TEMPLATE;
  if (route.intent === "needs-input") return CLARIFICATION_TEMPLATE;
  return META_TEMPLATE;
}
