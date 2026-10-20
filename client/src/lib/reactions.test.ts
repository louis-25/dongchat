import { test } from "node:test";
import assert from "node:assert/strict";
import { quickReactions, rememberReaction, summarizeReactions, withReaction, type Reaction } from "./reactions.ts";

test("반응: 한 사람당 하나 — 바꾸기·취소", () => {
  let list: Reaction[] = [];
  list = withReaction(list, "a", "❤️");
  list = withReaction(list, "b", "❤️");
  list = withReaction(list, "a", "🥹");
  assert.deepEqual(list, [{ userId: "b", reaction: "❤️" }, { userId: "a", reaction: "🥹" }]);
  assert.deepEqual(withReaction(list, "b", null), [{ userId: "a", reaction: "🥹" }]);
});

test("반응 요약: 많이 달린 순, 동률은 먼저 달린 순, 내 반응 표시", () => {
  const list: Reaction[] = [
    { userId: "a", reaction: "🥹" },
    { userId: "b", reaction: "❤️" },
    { userId: "c", reaction: "😂" },
    { userId: "d", reaction: "😂" },
  ];
  assert.deepEqual(summarizeReactions(list, "a"), [
    { emoji: "😂", count: 2, mine: false },
    { emoji: "🥹", count: 1, mine: true },
    { emoji: "❤️", count: 1, mine: false },
  ]);
});

test("최근 이모지: 맨 앞에, 중복 없이, 5개까지", () => {
  assert.deepEqual(rememberReaction([], "🍁"), ["🍁"]);
  assert.deepEqual(rememberReaction(["🍁", "🤨"], "🤨"), ["🤨", "🍁"]);
  assert.deepEqual(rememberReaction(["1", "2", "3", "4", "5"], "🍁"), ["🍁", "1", "2", "3", "4"]);
});

test("반응 줄: 최근 것 먼저, 남는 자리는 기본, 5개", () => {
  assert.deepEqual(quickReactions([]), ["❤️", "👍", "😂", "😮", "😢"]);
  assert.deepEqual(quickReactions(["🍁", "🤨"]), ["🍁", "🤨", "❤️", "👍", "😂"]);
  assert.deepEqual(quickReactions(["👍", "🍁"]), ["👍", "🍁", "❤️", "😂", "😮"]);
});
