import assert from "node:assert/strict";
import test from "node:test";

import { applyTestEnv } from "./test-env.ts";

applyTestEnv();

const { parseRtkSavings, RTK_NOT_TRACKED } = await import("../dist/rtk.js");

test("parseRtkSavings accepts the legacy gain format", () => {
  assert.equal(parseRtkSavings("Tokens saved: 1.5M (68.2%)"), "68.2%");
});

test("parseRtkSavings accepts newer percent-style gain output", () => {
  assert.equal(parseRtkSavings("RTK gain 41.0% across 12 commands"), "41.0%");
});

test("parseRtkSavings accepts bare percent tokens", () => {
  assert.equal(parseRtkSavings("total savings: 9.5%"), "9.5%");
});

test("parseRtkSavings returns the not-tracked sentinel for unparseable output", () => {
  assert.equal(parseRtkSavings("Total commands: 12"), RTK_NOT_TRACKED);
});

test("parseRtkSavings returns the not-tracked sentinel for empty input", () => {
  assert.equal(parseRtkSavings(""), RTK_NOT_TRACKED);
  assert.equal(parseRtkSavings("   "), RTK_NOT_TRACKED);
});
