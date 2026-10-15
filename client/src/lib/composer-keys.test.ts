import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldSend } from "./composer-keys.ts";

test("PC: Enter 전송, Shift+Enter 줄바꿈, 한글 조합 중 Enter는 전송 안 함", () => {
  assert.equal(shouldSend({ key: "Enter", shiftKey: false, isComposing: false }, false), true);
  assert.equal(shouldSend({ key: "Enter", shiftKey: true, isComposing: false }, false), false);
  assert.equal(shouldSend({ key: "Enter", shiftKey: false, isComposing: true }, false), false);
  assert.equal(shouldSend({ key: "a", shiftKey: false, isComposing: false }, false), false);
});

test("폰(터치): Enter는 줄바꿈, 보내기 버튼으로만 전송", () => {
  assert.equal(shouldSend({ key: "Enter", shiftKey: false, isComposing: false }, true), false);
});
