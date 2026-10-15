import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteUrl, shareOrCopy } from "./share.ts";

const data = { title: "t", text: "x", url: "https://a/invite/c" };

test("공유 창이 있으면 공유", async () => {
  let shared = false;
  assert.equal(await shareOrCopy(data, { share: async () => void (shared = true), clipboard: { writeText: async () => {} } }), "shared");
  assert.equal(shared, true);
});

test("사용자가 취소하면 복사하지 않음", async () => {
  let copied = false;
  const abort = Object.assign(new Error("x"), { name: "AbortError" });
  assert.equal(await shareOrCopy(data, { share: async () => { throw abort; }, clipboard: { writeText: async () => void (copied = true) } }), "cancelled");
  assert.equal(copied, false);
});

test("공유 미지원·실패면 복사", async () => {
  let copied = "";
  const clipboard = { writeText: async (s: string) => void (copied = s) };
  assert.equal(await shareOrCopy(data, { clipboard }), "copied");
  assert.equal(copied, data.url);
  assert.equal(await shareOrCopy(data, { share: async () => { throw new Error("NotAllowed"); }, clipboard }), "copied");
});

test("클립보드도 없거나 거부되면 unavailable", async () => {
  assert.equal(await shareOrCopy(data, {}), "unavailable");
  assert.equal(await shareOrCopy(data, { clipboard: { writeText: async () => { throw new Error("denied"); } } }), "unavailable");
});

test("초대 주소", () => {
  assert.equal(inviteUrl("https://a.app", "Ab_-1"), "https://a.app/invite/Ab_-1");
});
