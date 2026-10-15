import type { DomainError } from "../types/domain.ts";

export const NICKNAME_MAX = 20;

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
