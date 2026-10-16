import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeText, formatDateDivider, formatListTime, previewText } from "./format.ts";
import type { RoomSummary } from "../types/domain.ts";

const now = new Date(2026, 9, 15, 18, 0); // 로컬 2026-10-15 18:00
const iso = (...a: [number, number, number, number, number]) => new Date(...a).toISOString();

test("목록 시간: 오늘=시각, 어제, 올해=월일, 이전=연월일", () => {
  assert.equal(formatListTime(iso(2026, 9, 15, 15, 12), now), "오후 3:12");
  assert.equal(formatListTime(iso(2026, 9, 15, 0, 5), now), "오전 12:05");
  assert.equal(formatListTime(iso(2026, 9, 14, 23, 59), now), "어제");
  assert.equal(formatListTime(iso(2026, 9, 9, 10, 0), now), "10월 9일");
  assert.equal(formatListTime(iso(2025, 11, 3, 10, 0), now), "2025. 12. 3.");
});

test("날짜 구분선은 요일까지", () => {
  assert.equal(formatDateDivider(iso(2026, 9, 15, 9, 0)), "2026년 10월 15일 목요일");
});

test("배지: 0은 숨김, 100부터 99+", () => {
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(99), "99");
  assert.equal(badgeText(100), "99+");
});

test("미리보기: 없음·삭제·그룹 보낸사람·내 메시지·1:1", () => {
  const s: RoomSummary = { id: 1, name: "g", isGroup: true, createdAt: "", memberCount: 3, lastMessage: null, unreadCount: 0 };
  const ctx = { me: "me", senderName: (id: string) => (id === "u2" ? "준호" : "?") };
  assert.equal(previewText(s, ctx), "아직 메시지가 없어요");
  const msg = { id: 1, content: "사진 올렸어", sticker: null, deleted: false, senderId: "u2", at: "" };
  assert.equal(previewText({ ...s, lastMessage: { ...msg, deleted: true, content: "" } }, ctx), "삭제된 메시지입니다");
  assert.equal(previewText({ ...s, lastMessage: msg }, ctx), "준호: 사진 올렸어");
  assert.equal(previewText({ ...s, lastMessage: { ...msg, senderId: "me" } }, ctx), "사진 올렸어");
  assert.equal(previewText({ ...s, isGroup: false, lastMessage: msg }, ctx), "사진 올렸어");
  assert.equal(previewText({ ...s, lastMessage: { ...msg, content: "(이모티콘)", sticker: "love" } }, ctx), "준호: 사랑해", "이모티콘은 이름으로");
});
