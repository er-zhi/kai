import assert from "node:assert/strict";
import test from "node:test";
import { applyTestEnv } from "./test-env.ts";
import { routeEventWithLocalLLM } from "../dist/router.js";

applyTestEnv();

const routerUrl = process.env.KAI_ROUTER_URL;
const routerModel = process.env.KAI_ROUTER_MODEL;

test("classifies through a live local LLM router", { skip: !routerUrl }, async () => {
  assert(routerUrl);
  assert(routerModel);
  const route = await routeEventWithLocalLLM("add README docs", "haiku", {
    url: routerUrl,
    model: routerModel,
    timeoutMs: 30000,
  });

  assert.equal(route.source, "local-llm");
  assert.equal(route.decision, "call-model");
  assert.equal(route.commitExpected, true);
});
