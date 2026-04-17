import assert from "node:assert/strict";
import test from "node:test";
import { buildPullRequestDiffDigest, truncateDiffDigest } from "../dist/pr-diff.js";

test("buildPullRequestDiffDigest includes file names, status, and patches", () => {
  const digest = buildPullRequestDiffDigest([{
    filename: "auth.py",
    status: "added",
    additions: 33,
    deletions: 0,
    patch: "@@ -0,0 +1,2 @@\n+def login():\n+    pass",
  }], 12_000);

  assert.match(digest, /diff --git a\/auth\.py b\/auth\.py/);
  assert.match(digest, /status=added additions=33 deletions=0/);
  assert.match(digest, /\+def login/);
});

test("buildPullRequestDiffDigest handles files without patches", () => {
  const digest = buildPullRequestDiffDigest([{ filename: "large.bin", status: "modified" }], 12_000);
  assert.match(digest, /large\.bin/);
  assert.match(digest, /patch unavailable/);
});

test("truncateDiffDigest keeps bounded context", () => {
  const digest = truncateDiffDigest("a".repeat(100), 50);
  assert.ok(digest.length < 100);
  assert.match(digest, /truncated 50 chars/);
});
