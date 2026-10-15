import { test } from "node:test";
import assert from "node:assert/strict";
import { PROMPT_SNOOZE_MS, promptMode, shouldAutoSubscribe } from "./push-prompt.ts";

const now = 1_000_000_000_000;
const base = { supported: true, permission: "default" as NotificationPermission, subscribed: false, optedOut: false, iosBrowser: false, dismissedAt: null, now };

test("처음이면 물어본다", () => {
  assert.equal(promptMode(base), "ask");
});

test("이미 켜졌거나, 직접 껐거나, 미지원이면 안 띄운다", () => {
  assert.equal(promptMode({ ...base, subscribed: true }), null);
  assert.equal(promptMode({ ...base, optedOut: true }), null);
  assert.equal(promptMode({ ...base, supported: false }), null);
});

test("허용은 했는데 구독이 없으면 자동 등록에 맡긴다(안내 없음)", () => {
  assert.equal(promptMode({ ...base, permission: "granted" }), null);
});

test("브라우저에서 거절했으면 설정 안내", () => {
  assert.equal(promptMode({ ...base, permission: "denied" }), "denied");
});

test("닫으면 일주일 동안 다시 묻지 않는다", () => {
  assert.equal(promptMode({ ...base, dismissedAt: now - 1000 }), null);
  assert.equal(promptMode({ ...base, dismissedAt: now - PROMPT_SNOOZE_MS - 1 }), "ask");
});

test("아이폰 사파리(홈 화면 앱 아님)는 설치 안내가 먼저라 띄우지 않는다", () => {
  assert.equal(promptMode({ ...base, iosBrowser: true }), null);
});

test("자동 등록: 허용됨·미구독·직접 끄지 않음일 때만", () => {
  const s = { supported: true, permission: "granted" as NotificationPermission, subscribed: false, optedOut: false };
  assert.equal(shouldAutoSubscribe(s), true);
  assert.equal(shouldAutoSubscribe({ ...s, optedOut: true }), false);
  assert.equal(shouldAutoSubscribe({ ...s, subscribed: true }), false);
  assert.equal(shouldAutoSubscribe({ ...s, permission: "default" }), false);
  assert.equal(shouldAutoSubscribe({ ...s, supported: false }), false);
});
