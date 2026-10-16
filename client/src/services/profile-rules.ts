import type { DomainError } from "../types/domain.ts";

export const NICKNAME_MAX = 20;
export const STATUS_MESSAGE_MAX = 60; // DB check(profiles_status_message_len)와 같게

// 빈 값이면 null(아이디가 대신 보인다). 길이는 화면·서버 공통 규칙.
export const normalizeNickname = (input: string): string | null => {
  const v = input.trim();
  if (v === "") return null;
  if ([...v].length > NICKNAME_MAX) {
    const e: DomainError = { code: "VALIDATION_FAILED", message: `닉네임은 ${NICKNAME_MAX}자까지예요.` };
    throw e;
  }
  return v;
};

// 빈 값이면 null(표시 안 함)
export const normalizeStatusMessage = (input: string): string | null => {
  const v = input.trim();
  if (v === "") return null;
  if ([...v].length > STATUS_MESSAGE_MAX) {
    const e: DomainError = { code: "VALIDATION_FAILED", message: `상태 메시지는 ${STATUS_MESSAGE_MAX}자까지예요.` };
    throw e;
  }
  return v;
};
