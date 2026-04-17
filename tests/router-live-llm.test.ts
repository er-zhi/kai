import assert from "node:assert/strict";
import test from "node:test";
import { routeEventWithLocalLLM } from "../src/router";

const routerUrl = process.env.KAI_ROUTER_URL;
const routerModel = process.env.KAI_ROUTER_MODEL ?? "LFM2-350M";

test("classifies through a live local LLM router", { skip: !routerUrl }, async () => {
  assert(routerUrl);
  const route = await routeEventWithLocalLLM("add README docs", "haiku", {
    url: routerUrl,
    model: routerModel,
    timeoutMs: 30000,
  });

  assert.equal(route.source, "local-llm");
  assert.equal(route.decision, "call-model");
  assert.equal(route.commitExpected, true);
});
