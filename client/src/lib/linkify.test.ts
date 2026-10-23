import { test } from "node:test";
import assert from "node:assert/strict";
import { splitLinks } from "./linkify.ts";

const links = (s: string) => splitLinks(s).flatMap((p) => (p.href ? [p.href] : []));

test("링크가 없으면 글자 하나", () => {
  assert.deepEqual(splitLinks("없음"), [{ text: "없음" }]);
});

test("끝 문장부호는 링크에서 뺀다", () => {
  assert.deepEqual(splitLinks("여기 https://a.com/x. 봐"), [
    { text: "여기 " },
    { text: "https://a.com/x", href: "https://a.com/x" },
    { text: ". 봐" },
  ]);
  assert.deepEqual(links("https://a.com/x?!"), ["https://a.com/x"]);
});

test("괄호: 바깥 괄호는 빼고 주소 안의 짝 괄호는 남긴다", () => {
  assert.deepEqual(links("(https://a.com)"), ["https://a.com"]);
  assert.deepEqual(links("https://w.org/Foo_(bar)"), ["https://w.org/Foo_(bar)"]);
});

test("http(s)만 링크", () => {
  assert.deepEqual(links("javascript:alert(1) http://b.com"), ["http://b.com"]);
});

test("여러 링크와 줄바꿈 보존, 이어 붙이면 원문", () => {
  const s = "회사A · 백엔드\nhttps://example.com/1\n회사B\nhttps://example.com/2";
  assert.deepEqual(links(s), ["https://example.com/1", "https://example.com/2"]);
  assert.equal(splitLinks(s).map((p) => p.text).join(""), s);
});
