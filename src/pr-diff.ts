import type { Octokit } from "@octokit/rest";

export type PullRequestFileForDiff = {
  filename: string;
  previous_filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string;
};

export function truncateDiffDigest(diff: string, maxChars: number): string {
  if (diff.length <= maxChars) return diff;
  const head = diff.slice(0, Math.floor(maxChars * 0.7));
  const tail = diff.slice(-Math.floor(maxChars * 0.2));
  return `${head}\n... [truncated ${diff.length - maxChars} chars] ...\n${tail}`;
}

export function buildPullRequestDiffDigest(
  files: PullRequestFileForDiff[],
  maxChars: number,
): string {
  const chunks = files.map((file) => {
    const status = file.status ?? "modified";
    const oldName = file.previous_filename ?? file.filename;
    const additions = file.additions ?? 0;
    const deletions = file.deletions ?? 0;
    const header = [
      `diff --git a/${oldName} b/${file.filename}`,
      `# status=${status} additions=${additions} deletions=${deletions}`,
    ];
    if (!file.patch) {
      header.push("# patch unavailable from GitHub API for this file");
      return header.join("\n");
    }
    return `${header.join("\n")}\n${file.patch}`;
  });

  return truncateDiffDigest(chunks.join("\n\n"), maxChars);
}

export async function getPullRequestDiffDigest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  maxChars: number,
): Promise<string> {
  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });
  return buildPullRequestDiffDigest(files, maxChars);
}
