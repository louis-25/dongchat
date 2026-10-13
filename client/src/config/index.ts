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
