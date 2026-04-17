export type ClaudeSpawnSpec = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

export function buildClaudeSpawnSpec(input: {
  isRoot: boolean;
  apiKey: string;
  claudeArgs: string[];
  env: NodeJS.ProcessEnv;
}): ClaudeSpawnSpec {
  const childEnv = { ...input.env, ANTHROPIC_API_KEY: input.apiKey };
  if (!input.isRoot) {
    return { command: "claude", args: input.claudeArgs, env: childEnv };
  }
  return {
    command: "sudo",
    args: ["-E", "-u", "kai", "--", "claude", ...input.claudeArgs],
    env: childEnv,
  };
}
