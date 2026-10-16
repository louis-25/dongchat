import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeNickname, normalizeStatusMessage } from "./profile-rules.ts";

test("닉네임: 앞뒤 공백 제거, 빈 값은 null, 20자까지", () => {
  assert.equal(normalizeNickname("  동현 "), "동현");
  assert.equal(normalizeNickname("   "), null);
  assert.equal(normalizeNickname("가".repeat(20)), "가".repeat(20));
  assert.throws(() => normalizeNickname("가".repeat(21)), (e: { code?: string }) => e.code === "VALIDATION_FAILED");
});

test("상태 메시지: 앞뒤 공백 제거, 빈 값은 null, 60자까지", () => {
  assert.equal(normalizeStatusMessage(" 오늘도 화이팅 "), "오늘도 화이팅");
  assert.equal(normalizeStatusMessage(""), null);
  assert.equal(normalizeStatusMessage("가".repeat(60)), "가".repeat(60));
  assert.throws(() => normalizeStatusMessage("가".repeat(61)), (e: { code?: string }) => e.code === "VALIDATION_FAILED");
});
