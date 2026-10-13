// 앱 도메인 타입. 백엔드(Supabase/NestJS)와 무관한 계약이며 services/가 이 타입으로 변환해 반환한다.
export type DomainError = { code: string; message: string };

export type AuthUser = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};
