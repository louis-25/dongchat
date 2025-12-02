import { useMutation, UseMutationResult } from '@tanstack/react-query';
import apiClient, { ApiError, ApiResponse } from '@/lib/api-client';
import type { RegisterDto, LoginDto, AuthResponseDto } from '@/lib/api';

/**
 * 회원가입 mutation
 */
export function useRegister(): UseMutationResult<ApiResponse<any>, ApiError, RegisterDto> {
    return useMutation({
        mutationFn: async (data: RegisterDto) => {
            return apiClient.post('/auth/register', data);
        },
        onSuccess: (data) => {
            console.log('[Auth] 회원가입 성공:', data);
        },
        onError: (error: ApiError) => {
            console.error('[Auth] 회원가입 실패:', error.message);
        },
    });
}

/**
 * 로그인 mutation
 */
export function useLogin(): UseMutationResult<ApiResponse<AuthResponseDto>, ApiError, LoginDto> {
    return useMutation({
        mutationFn: async (data: LoginDto) => {
            return apiClient.post<AuthResponseDto>('/auth/login', data);
        },
        onSuccess: (data) => {
            console.log('[Auth] 로그인 성공:', data);
        },
        onError: (error: ApiError) => {
            console.error('[Auth] 로그인 실패:', error.message);
        },
    });
}
