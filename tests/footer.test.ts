import assert from "node:assert/strict";
import test from "node:test";
import { buildRouterFooter } from "../src/footer";

test("router footer explicitly marks local LLM", () => {
  const footer = buildRouterFooter("FunctionGemma-270M", 1);
  assert.match(footer, /local LLM/i);
  assert.match(footer, /FunctionGemma-270M/);
});
