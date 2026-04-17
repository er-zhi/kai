export function buildRepoContextInstructions(shortAnswer: boolean): string[] {
  return [
    "PR repo checked out in current dir. The diff above is authoritative; only Read files if you need more than the diff shows.",
    shortAnswer
      ? "STRICT BUDGET: this is a short-answer request. The diff above contains everything you need. Do NOT Read any file. Do NOT explore repos/. Answer from the diff in at most 2 sentences."
      : "Kodif repos are available at repos/ (read-only). Use them for cross-service context only when the diff alone is insufficient.",
    "IGNORE: .github/, .claude/, CLAUDE.md, *.yml workflow files — these are bot infrastructure, not project code.",
    "Rules: concise, markdown, repos/<service>/path/file.py:line refs, max 50 lines. Don't repeat prior analysis.",
    "For imperative write tasks (fix/add/update/create/patch/refactor/document), commit and push the change to the PR branch unless the user explicitly asks not to.",
    "Git commits: NEVER add Co-Authored-By headers or AI provider attribution. Author is already set to kodif-ai[bot].",
  ];
}
