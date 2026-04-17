import assert from "node:assert/strict";
import test from "node:test";

import { applyTestEnv } from "./test-env.ts";

applyTestEnv();

const { parseRtkSavings } = await import("../dist/index.js");

test("parseRtkSavings accepts the legacy gain format", () => {
  assert.equal(parseRtkSavings("Tokens saved: 1.5M (68.2%)"), "68.2%");
});

test("parseRtkSavings accepts newer percent-style gain output", () => {
  assert.equal(parseRtkSavings("RTK gain 41.0% across 12 commands"), "41.0%");
});

test("parseRtkSavings accepts bare percent tokens", () => {
  assert.equal(parseRtkSavings("total savings: 9.5%"), "9.5%");
});

test("parseRtkSavings returns empty string for unparseable output", () => {
  assert.equal(parseRtkSavings("Total commands: 12"), "");
});
