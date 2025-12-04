import { atom } from 'jotai';
import type { AuthResponseDtoUser } from '@/lib/api/models';

// 유저 정보를 저장하는 atom
export const userAtom = atom<AuthResponseDtoUser | null>(null);

// 액세스 토큰을 저장하는 atom
export const accessTokenAtom = atom<string | null>(null);
