export const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// 개발 환경에서는 임시 secret 사용, 프로덕션에서는 반드시 환경 변수 필요
export const NEXTAUTH_SECRET =
  process.env.NEXT_PUBLIC_NEXTAUTH_SECRET ||
  (process.env.NODE_ENV === "development"
    ? "development-secret-key-change-in-production"
    : "");

export const KAKAO_CLIENT_ID = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID || "";
export const KAKAO_CLIENT_SECRET =
  process.env.NEXT_PUBLIC_KAKAO_CLIENT_SECRET || "";
