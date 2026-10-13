import { test } from "node:test";
import assert from "node:assert/strict";
import { toDomainError } from "./errors.ts";

test("RPC raise(P0001)는 message를 코드로, hint를 메시지로", () => {
  assert.deepEqual(
    toDomainError({ code: "P0001", message: "CHAT_FORBIDDEN", hint: "권한이 없습니다." }),
    { code: "CHAT_FORBIDDEN", message: "권한이 없습니다." },
  );
});

test("hint가 없으면 코드를 메시지로도 사용", () => {
  assert.deepEqual(toDomainError({ code: "P0001", message: "X_CODE" }), { code: "X_CODE", message: "X_CODE" });
});

test("RLS·권한 거부(42501)는 CHAT_FORBIDDEN", () => {
  assert.equal(toDomainError({ code: "42501", message: "permission denied for table messages" }).code, "CHAT_FORBIDDEN");
});

test("Auth 잘못된 자격 증명", () => {
  assert.equal(toDomainError({ code: "invalid_credentials", message: "Invalid login credentials" }).code, "AUTH_INVALID_CREDENTIALS");
});

test("Auth 중복 이메일", () => {
  assert.equal(toDomainError({ code: "user_already_exists", message: "User already registered" }).code, "AUTH_DUPLICATE_EMAIL");
});

test("가입 트리거 실패(username 경합)는 AUTH_DUPLICATE_USER", () => {
  assert.equal(toDomainError({ code: "unexpected_failure", message: "Database error saving new user" }).code, "AUTH_DUPLICATE_USER");
});

test("알 수 없는 입력은 UNKNOWN", () => {
  assert.deepEqual(toDomainError("boom"), { code: "UNKNOWN", message: "알 수 없는 오류가 발생했습니다." });
  assert.deepEqual(toDomainError(new Error("network down")), { code: "UNKNOWN", message: "network down" });
});
