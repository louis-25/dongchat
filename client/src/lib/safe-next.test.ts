import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./safe-next.ts";

test("같은 사이트 경로만 허용, 나머지는 기본 화면", () => {
  assert.equal(safeNext("/invite/abc"), "/invite/abc");
  assert.equal(safeNext("/chat/rooms/3?x=1"), "/chat/rooms/3?x=1");
  for (const bad of [null, undefined, "", "invite", "//evil.com", "/\\evil.com", "https://evil.com", "/login?next=/x", "/join", "/auth/callback", "javascript:alert(1)"]) {
    assert.equal(safeNext(bad), "/chat/rooms", String(bad));
  }
  assert.equal(safeNext("//evil.com", "/chat/friends"), "/chat/friends");
});
