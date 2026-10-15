import { test } from "node:test";
import assert from "node:assert/strict";
import { installMode } from "./install.ts";

const base = { standalone: false, ios: false, dismissed: false, canPrompt: false };

test("설치 안내: 설치 가능하면 prompt, iOS 사파리면 안내 문구, 이미 설치·닫음이면 없음", () => {
  assert.equal(installMode({ ...base, canPrompt: true }), "prompt");
  assert.equal(installMode({ ...base, ios: true }), "ios");
  assert.equal(installMode(base), null);
  assert.equal(installMode({ ...base, canPrompt: true, standalone: true }), null);
  assert.equal(installMode({ ...base, ios: true, dismissed: true }), null);
});
