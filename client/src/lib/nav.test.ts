import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeInAppNav, isPlainClick, markInAppNav } from "./nav.ts";

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

test("새 탭·수정키 클릭은 앱 안 이동이 아니다", () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
  assert.equal(isPlainClick(click), true);
  assert.equal(isPlainClick({ ...click, ctrlKey: true }), false);
  assert.equal(isPlainClick({ ...click, metaKey: true }), false);
  assert.equal(isPlainClick({ ...click, shiftKey: true }), false);
  assert.equal(isPlainClick({ ...click, button: 1 }), false);
  assert.equal(isPlainClick({ ...click, defaultPrevented: true }), false);
});
