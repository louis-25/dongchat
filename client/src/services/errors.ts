import type { DomainError } from "../types/domain";

// 서버(RPC·RLS·Auth) 에러를 앱 도메인 에러로 변환한다. 백엔드 교체 시 이 파일의 매핑만 바꾼다.
const AUTH_CODE_MAP: Record<string, string> = {
  invalid_credentials: "AUTH_INVALID_CREDENTIALS",
  user_already_exists: "AUTH_DUPLICATE_EMAIL",
  email_exists: "AUTH_DUPLICATE_EMAIL",
  weak_password: "VALIDATION_FAILED",
  validation_failed: "VALIDATION_FAILED",
  email_address_invalid: "VALIDATION_FAILED",
  over_email_send_rate_limit: "AUTH_RATE_LIMITED",
  over_request_rate_limit: "AUTH_RATE_LIMITED",
  // 가입 트리거 실패 = 동시 가입으로 username unique 충돌
  unexpected_failure: "AUTH_DUPLICATE_USER",
};

type RawError = { code?: unknown; message?: unknown; hint?: unknown };

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

// 브라우저 fetch의 네트워크 실패 문구(Chrome·Safari·Firefox). supabase-js는 "TypeError: <문구>"로 돌려준다.
const NETWORK_FAILURE = /^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource)/;

export function toDomainError(error: unknown): DomainError {
  const raw: RawError = typeof error === "object" && error !== null ? (error as RawError) : {};
  const code = str(raw.code);
  const message = str(raw.message);
  const hint = str(raw.hint);

  if (!code && message && NETWORK_FAILURE.test(message)) {
    return { code: "NETWORK_ERROR", message: "연결이 불안정해요. 다시 시도해 주세요." };
  }

  // RPC: raise exception '<CODE>' using hint = '<사용자 메시지>' (SQLSTATE P0001)
  if (code === "P0001" && message) return { code: message, message: hint ?? message };
  if (code === "42501") return { code: "CHAT_FORBIDDEN", message: "접근 권한이 없습니다." };
  // Auth 원문(영어)은 버리고 화면 문구는 코드 매핑(lib/error-handler)에 맡긴다.
  if (code && AUTH_CODE_MAP[code]) return { code: AUTH_CODE_MAP[code], message: "" };
  return { code: "UNKNOWN", message: message ?? "알 수 없는 오류가 발생했습니다." };
}
