import { atom } from 'jotai';

// 사용자 정보 타입 정의
export type User = {
  id: number;
  username: string;
  role?: string;
  profileImage?: string | null;
};

// 유저 정보를 저장하는 atom (초기값은 항상 null로 설정하여 hydration mismatch 방지)
// 실제 값은 useEffect에서 클라이언트에서만 로드됨
export const userAtom = atom<User | null>(null);

// 액세스 토큰을 저장하는 atom (초기값은 항상 null로 설정하여 hydration mismatch 방지)
// 실제 값은 useEffect에서 클라이언트에서만 로드됨
export const accessTokenAtom = atom<string | null>(null);
