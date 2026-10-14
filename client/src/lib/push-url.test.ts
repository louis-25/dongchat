import { test } from "node:test";
import assert from "node:assert/strict";
import { roomIdFromSearch } from "./push-url.ts";

test("알림 URL의 ?room=을 방 id로 읽는다", () => {
  assert.equal(roomIdFromSearch("?room=42"), 42);
  assert.equal(roomIdFromSearch("?x=1&room=7"), 7);
  assert.equal(roomIdFromSearch(""), null);
  assert.equal(roomIdFromSearch("?room=abc"), null);
  assert.equal(roomIdFromSearch("?room=0"), null);
  assert.equal(roomIdFromSearch("?room=-3"), null);
});
