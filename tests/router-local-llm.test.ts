import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { LocalRouterUnavailableError, routeEventWithLocalLLM } from "../src/router";

function startFakeLLM(content: string, status = 200): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404).end();
      return;
    }

    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert(address && typeof address === "object");
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

test("uses local LLM classification before paid model work", async () => {
  const llm = await startFakeLLM(JSON.stringify({
    intent: "write-fix",
    decision: "call-model",
    confidence: 0.81,
    reason: "development write task",
    maxContextTokens: 24000,
    commitExpected: true,
  }));

  try {
    const route = await routeEventWithLocalLLM("add README docs", "haiku", { url: llm.url });
    assert.equal(route.source, "local-llm");
    assert.equal(route.intent, "write-fix");
    assert.equal(route.decision, "call-model");
    assert.equal(route.commitExpected, true);
    assert.equal(route.maxContextTokens, 24000);
  } finally {
    await llm.close();
  }
});

test("fails closed when local LLM is unavailable", async () => {
  await assert.rejects(
    routeEventWithLocalLLM("add README docs", "haiku", { url: "http://127.0.0.1:9", timeoutMs: 100 }),
    LocalRouterUnavailableError,
  );
});

test("fails closed when local LLM returns invalid classification", async () => {
  const llm = await startFakeLLM("not json");

  try {
    await assert.rejects(
      routeEventWithLocalLLM("review this PR", "haiku", { url: llm.url }),
      LocalRouterUnavailableError,
    );
  } finally {
    await llm.close();
  }
});

test("keeps hard no-token commands deterministic without local LLM", async () => {
  const route = await routeEventWithLocalLLM("stop", "haiku");
  assert.equal(route.intent, "stop");
  assert.equal(route.source, "rules");
});
