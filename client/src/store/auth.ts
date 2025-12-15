import { atom } from 'jotai';
import type { AuthResponseDtoUser } from '@/lib/api/models';

// 유저 정보를 저장하는 atom (초기값은 항상 null로 설정하여 hydration mismatch 방지)
// 실제 값은 useEffect에서 클라이언트에서만 로드됨
export const userAtom = atom<AuthResponseDtoUser | null>(null);

// 액세스 토큰을 저장하는 atom (초기값은 항상 null로 설정하여 hydration mismatch 방지)
// 실제 값은 useEffect에서 클라이언트에서만 로드됨
export const accessTokenAtom = atom<string | null>(null);
