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

// 개발 환경에서는 임시 secret 사용, 프로덕션에서는 반드시 환경 변수 필요
export const NEXTAUTH_SECRET =
  process.env.NEXT_PUBLIC_NEXTAUTH_SECRET ||
  (process.env.NODE_ENV === "development"
    ? "development-secret-key-change-in-production"
    : "");

export const KAKAO_CLIENT_ID = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID || "";
export const KAKAO_CLIENT_SECRET =
  process.env.NEXT_PUBLIC_KAKAO_CLIENT_SECRET || "";
