import { test } from "node:test";
import assert from "node:assert/strict";
import { isTokenShape, prepareParts, splitMessage } from "./split.ts";

const len = (s: string) => [...s].length;

test("줄 단위로 2,000자까지 이어 붙이고 한 줄은 자르지 않는다", () => {
  assert.deepEqual(splitMessage("a\nb", 2000), ["a\nb"]);
  const line = "x".repeat(1500);
  assert.deepEqual(splitMessage(`${line}\n${line}`, 2000), [line, line]);
  assert.deepEqual(splitMessage(`${line}\r\n${line}`, 2000), [line, line]);
});

test("혼자 2,000자를 넘는 줄만 글자 수로 자른다", () => {
  assert.deepEqual(splitMessage("x".repeat(4500), 2000).map(len), [2000, 2000, 500]);
});

test("경계값: 정확히 2,000자는 하나, 2,001자는 둘", () => {
  assert.equal(splitMessage("x".repeat(2000), 2000).length, 1);
  assert.equal(splitMessage("x".repeat(2001), 2000).length, 2);
});

test("앞뒤 공백 제거, 빈 조각 버림", () => {
  assert.deepEqual(splitMessage("  \n\n  x  \n", 2000), ["x"]);
  assert.deepEqual(splitMessage("", 2000), []);
  assert.deepEqual(splitMessage(" \n \n", 2000), []);
});

test("이모지는 코드 포인트로 세고 반으로 쪼개지 않는다", () => {
  const parts = splitMessage("😀".repeat(2001), 2000);
  assert.equal(parts.length, 2);
  for (const p of parts) {
    assert.ok(len(p) <= 2000);
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(p), "깨진 서로게이트 없음");
  }
});

test("토큰 형식: dch_ + 소문자 hex 64자", () => {
  assert.equal(isTokenShape(`dch_${"a".repeat(64)}`), true);
  assert.equal(isTokenShape(`dch_${"A".repeat(64)}`), false);
  assert.equal(isTokenShape(`dch_${"a".repeat(63)}`), false);
  assert.equal(isTokenShape("a".repeat(68)), false);
});

test("보낼 조각 준비: 빈 본문 400, 2만 자 초과 413, 나눈 뒤 10개 초과도 413", () => {
  assert.equal(prepareParts("  \n "), 400);
  assert.equal(prepareParts("x".repeat(20_001)), 413);
  const lines = Array.from({ length: 19 }, () => "y".repeat(1001)).join("\n"); // 2만 자 미만이지만 19조각
  assert.equal(prepareParts(lines), 413);
  assert.deepEqual(prepareParts("a\nb"), ["a\nb"]);
});
