import { test } from "node:test";
import assert from "node:assert/strict";
import { getErrorMessage } from "./error-handler.ts";

test("검증 실패는 구체적인 사유(RPC hint·클라 검증 문구)를 그대로 보여 준다", () => {
  assert.equal(
    getErrorMessage({ code: "VALIDATION_FAILED", message: "메시지는 1~2000자여야 합니다." }),
    "메시지는 1~2000자여야 합니다.",
  );
  assert.equal(getErrorMessage({ code: "VALIDATION_FAILED", message: "" }), "입력값이 올바르지 않습니다.");
});
