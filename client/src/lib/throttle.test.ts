import { test } from "node:test";
import assert from "node:assert/strict";
import { createThrottle } from "./throttle.ts";

test("간격 안의 반복 호출은 건너뛰고, 간격이 지나면 다시 허용한다", () => {
  let now = 1_000;
  const allow = createThrottle(10_000, () => now);
  assert.equal(allow(), true, "첫 호출은 항상 허용");
  now += 5_000;
  assert.equal(allow(), false, "10초 안 재시도는 건너뜀");
  now += 5_000;
  assert.equal(allow(), true, "10초 지나면 허용");
});
