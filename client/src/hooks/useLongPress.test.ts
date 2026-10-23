import { test } from "node:test";
import assert from "node:assert/strict";
import { ignoresLongPress } from "./useLongPress.ts";

// closest만 흉내 낸 대상(Node 테스트에는 DOM이 없다)
const inside = (matches: boolean) => ({ closest: (sel: string) => (matches && sel.includes("input") ? {} : null) }) as unknown as EventTarget;

test("입력칸·시트 안에서는 말풍선 길게 누르기를 쓰지 않는다(붙여넣기 메뉴·시트 위 누르기)", () => {
  assert.equal(ignoresLongPress(inside(true)), true);
  assert.equal(ignoresLongPress(inside(false)), false);
  assert.equal(ignoresLongPress(null), false);
});

test("링크 위에서도 말풍선 길게 누르기(메뉴)가 우선한다", () => {
  let selector = "";
  ignoresLongPress({ closest: (sel: string) => ((selector = sel), null) } as unknown as EventTarget);
  assert.ok(!selector.split(",").map((s) => s.trim()).includes("a"));
});
