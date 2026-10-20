import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightParts } from "./search.ts";

test("검색어 강조: 대소문자 무시, 여러 번, 특수문자 그대로", () => {
  assert.deepEqual(highlightParts("Gangnam 가자 gangnam", "GANGNAM"), [
    { text: "Gangnam", hit: true },
    { text: " 가자 ", hit: false },
    { text: "gangnam", hit: true },
  ]);
  assert.deepEqual(highlightParts("할인 100% 쿠폰", "100%"), [
    { text: "할인 ", hit: false },
    { text: "100%", hit: true },
    { text: " 쿠폰", hit: false },
  ]);
  assert.deepEqual(highlightParts("없음", "x"), [{ text: "없음", hit: false }]);
  assert.deepEqual(highlightParts("abc", " "), [{ text: "abc", hit: false }]);
});
