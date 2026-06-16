// BASE_URL 정규화: 끝의 슬래시 제거
const normalizeBaseUrl = (url: string): string => {
  return url.trim().replace(/\/+$/, "");
};

export const BASE_URL = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
);

// URL 경로 조합 유틸리티: 슬래시 중복 방지
export const joinUrl = (baseUrl: string, path: string): string => {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

// NextAuth 시크릿 — 서버 전용. auth.ts(서버 모듈)에서만 사용된다.
// NEXT_PUBLIC_ 접두사를 쓰면 브라우저 번들에 그대로 노출되므로 절대 사용 금지.
// 개발 환경에서는 임시 secret 사용, 프로덕션에서는 반드시 환경 변수 필요
export const NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV === "development"
    ? "development-secret-key-change-in-production"
    : "");

// Kakao OAuth — auth.ts(서버)에서만 사용. 서버 전용 env로 관리(NEXT_PUBLIC_ 금지).
export const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID || "";
export const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || "";
