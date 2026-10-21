import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanOptions, isClosed, nextChoice, normalizeLabel, pollMeta, toLocalInput, voteScope, withMyVote } from "./polls.ts";
import type { Poll } from "../types/domain.ts";

const poll = (over: Partial<Poll> = {}): Poll => ({
  id: 1, roomId: 1, messageId: 10, creatorId: "me", question: "점심", multiple: false, anonymous: false, allowAdd: false,
  closesAt: null, closed: false, voterCount: 1,
  options: [
    { id: 1, label: "A", count: 1, voters: ["친구"] },
    { id: 2, label: "B", count: 0, voters: [] },
  ],
  myOptionIds: [],
  ...over,
});

test("정리: 연속 공백 한 칸, 앞뒤 공백 제거", () => {
  assert.equal(normalizeLabel("  볶음   밥 "), "볶음 밥");
});

test("선택지: 빈 칸 제거, 대소문자·공백 무시 중복 제거(첫 등장 유지) — 서버 create_poll과 같은 규칙", () => {
  assert.deepEqual(cleanOptions([" 짜장 ", "짬뽕", "짜장", "", "  ", "Cola", "cola", "볶음  밥"]), ["짜장", "짬뽕", "Cola", "볶음 밥"]);
});

test("한 개 선택: 다른 줄은 옮기기, 같은 줄은 취소", () => {
  assert.deepEqual(nextChoice([], 1, false), [1]);
  assert.deepEqual(nextChoice([1], 2, false), [2]);
  assert.deepEqual(nextChoice([2], 2, false), []);
});

test("여러 개 선택: 토글", () => {
  assert.deepEqual(nextChoice([1], 2, true), [1, 2]);
  assert.deepEqual(nextChoice([1, 2], 1, true), [2]);
});

test("낙관적 반영: 처음 투표하면 참여자 +1, 옮기면 표만 이동, 취소하면 -1", () => {
  const first = withMyVote(poll(), [2]);
  assert.deepEqual(first.options.map((o) => o.count), [1, 1]);
  assert.equal(first.voterCount, 2);
  assert.deepEqual(first.myOptionIds, [2]);
  const moved = withMyVote(first, [1]);
  assert.deepEqual(moved.options.map((o) => o.count), [2, 0]);
  assert.equal(moved.voterCount, 2);
  const cancelled = withMyVote(moved, []);
  assert.deepEqual(cancelled.options.map((o) => o.count), [1, 0]);
  assert.equal(cancelled.voterCount, 1);
});

test("마감 판정: 일찍 마감했거나 마감 시각이 지났으면 닫힘", () => {
  const at = new Date(2026, 9, 22, 18, 0);
  assert.equal(isClosed(poll({ closed: true }), at), true);
  assert.equal(isClosed(poll({ closesAt: at.toISOString() }), new Date(2026, 9, 22, 17, 59)), false);
  assert.equal(isClosed(poll({ closesAt: at.toISOString() }), at), true);
  assert.equal(isClosed(poll(), at), false);
});

test("머리 문구: 익명 · 여러 개 선택 · 마감 시각 / 마감됨", () => {
  const at = new Date(2026, 9, 22, 18, 5);
  const before = new Date(2026, 9, 21, 9, 0);
  assert.equal(pollMeta(poll({ anonymous: true, multiple: true, closesAt: at.toISOString() }), before), "익명 · 여러 개 선택 · 10/22 18:05 마감");
  assert.equal(pollMeta(poll({ closesAt: at.toISOString() }), at), "마감됨");
  assert.equal(pollMeta(poll(), before), "");
});

test("datetime-local 값은 기기 시각 그대로, 다시 Date로 읽으면 같은 순간", () => {
  const d = new Date(2026, 0, 5, 7, 3);
  assert.equal(toLocalInput(d), "2026-01-05T07:03");
  assert.equal(new Date(toLocalInput(d)).getTime(), d.getTime());
});

test("같은 투표의 표는 하나씩 차례로 보낸다(빠르게 연달아 눌러도 마지막 선택이 남게)", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const qc = new QueryClient();
  const order: string[] = [];
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  const run = (name: string, wait?: Promise<void>) =>
    qc.getMutationCache().build(qc, {
      scope: voteScope(1),
      mutationFn: async () => {
        order.push(`start ${name}`);
        await wait;
        order.push(`end ${name}`);
      },
    }).execute(undefined);
  const a = run("A", hold);
  const b = run("B");
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(order, ["start A"]);
  release();
  await Promise.all([a, b]);
  assert.deepEqual(order, ["start A", "end A", "start B", "end B"]);
});
