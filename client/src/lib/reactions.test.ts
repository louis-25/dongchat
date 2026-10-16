import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeReactions, withReaction, type Reaction } from "./reactions.ts";

test("반응: 한 사람당 하나 — 바꾸기·취소", () => {
  let list: Reaction[] = [];
  list = withReaction(list, "a", "heart");
  list = withReaction(list, "b", "heart");
  list = withReaction(list, "a", "lol");
  assert.deepEqual(list, [{ userId: "b", reaction: "heart" }, { userId: "a", reaction: "lol" }]);
  assert.deepEqual(withReaction(list, "b", null), [{ userId: "a", reaction: "lol" }]);
});

test("반응 요약: 정해진 순서, 개수, 내 반응 표시, 0개는 숨김", () => {
  const list: Reaction[] = [
    { userId: "a", reaction: "lol" },
    { userId: "b", reaction: "heart" },
    { userId: "c", reaction: "lol" },
  ];
  assert.deepEqual(
    summarizeReactions(list, "a").map(({ code, count, mine }) => ({ code, count, mine })),
    [
      { code: "heart", count: 1, mine: false },
      { code: "lol", count: 2, mine: true },
    ],
  );
});
