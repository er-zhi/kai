import assert from "node:assert/strict";
import test from "node:test";
import { guardRouterIntent, isMetaQuestion, isReviewRequest, normalizeWhitespace, routeEvent, shouldVerifyCommit } from "../dist/router.js";

test("normalizes whitespace", () => {
  assert.equal(normalizeWhitespace("  add   README\n sentence\t now  "), "add README sentence now");
});

test("empty message gets deterministic needs-input (no LLM needed)", () => {
  const route = routeEvent("", "haiku");
  assert.equal(route.intent, "needs-input");
  assert.equal(route.decision, "ask-clarification");
  assert.equal(route.source, "rules");
  assert.equal(route.maxContextTokens, 0);
});

test("non-empty message returns pending-llm skeleton with source=rules", () => {
  const route = routeEvent("add README docs", "haiku");
  assert.equal(route.intent, "simple-answer");
  assert.equal(route.decision, "call-model");
  assert.equal(route.source, "rules");
  assert.match(route.reason, /pending local-llm/);
});

test("shouldVerifyCommit helper recognizes imperative write tasks", () => {
  assert.equal(shouldVerifyCommit("add one README sentence"), true);
  assert.equal(shouldVerifyCommit("fix docs, commit and push"), true);
  assert.equal(shouldVerifyCommit("can you add README?"), false);
});

test("isMetaQuestion helper recognizes identity questions", () => {
  assert.equal(isMetaQuestion("who are you"), true);
  assert.equal(isMetaQuestion("кто ты"), true);
  assert.equal(isMetaQuestion("add README"), false);
});

test("isReviewRequest recognizes security review prompts", () => {
  assert.equal(isReviewRequest("do a comprehensive security review of this authentication service"), true);
  assert.equal(isReviewRequest("analyze JWT token lifecycle and OWASP compliance"), true);
  assert.equal(isReviewRequest("who are you"), false);
});

test("guardRouterIntent prevents review prompts from becoming meta templates", () => {
  const prompt = "do a comprehensive security review of this authentication service. analyze JWT token generation, OWASP compliance, and code locations.";
  assert.equal(guardRouterIntent("meta-template", prompt), "review");
  assert.equal(guardRouterIntent("simple-answer", prompt), "review");
  assert.equal(guardRouterIntent("meta-template", "who are you"), "meta-template");
});
