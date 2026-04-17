import assert from "node:assert/strict";
import test from "node:test";
import { applyTestEnv } from "./test-env.ts";
import { routeEventWithLocalLLM } from "../dist/router.js";

applyTestEnv();

const routerUrl = process.env.KAI_ROUTER_URL;
const routerModel = "LFM2-350M";

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

test("routes short PR security risk question to model path", { skip: !routerUrl }, async () => {
  assert(routerUrl);
  const route = await routeEventWithLocalLLM("one sentence: what is the biggest security risk in this PR?", "haiku", {
    url: routerUrl,
    model: routerModel,
    timeoutMs: 30000,
  });

  assert.equal(route.source, "local-llm");
  assert.notEqual(route.intent, "meta-template");
  assert.equal(route.decision, "call-model");
});

test("routes repo location question as simple-answer", { skip: !routerUrl }, async () => {
  assert(routerUrl);
  const route = await routeEventWithLocalLLM("which file starts HTTP app in repos/kodif-gateway?", "haiku", {
    url: routerUrl,
    model: routerModel,
    timeoutMs: 30000,
  });

  assert.equal(route.source, "local-llm");
  assert.equal(route.intent, "simple-answer");
  assert.equal(route.decision, "call-model");
});
