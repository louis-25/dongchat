import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeInAppNav, markInAppNav } from "./nav.ts";

const memory = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } };
};

test("앱 안 이동 표시는 한 번만 소비된다", () => {
  const store = memory();
  assert.equal(consumeInAppNav(store), false);
  markInAppNav(store);
  assert.equal(consumeInAppNav(store), true);
  assert.equal(consumeInAppNav(store), false);
});
