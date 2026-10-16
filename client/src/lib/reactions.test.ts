import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeReactions, withReaction, type Reaction } from "./reactions.ts";

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
