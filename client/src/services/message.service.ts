import { useQuery, UseQueryResult } from '@tanstack/react-query';
import apiClient, { ApiError, ApiResponse } from '@/lib/api-client';
import type { Message } from '@/lib/api';

/**
 * 메시지 조회 쿼리 파라미터
 */
export interface MessageQueryParams {
    page?: number;
    limit?: number;
}

/**
 * 메시지 목록 조회 query
 */
export function useMessages(
    params: MessageQueryParams = { page: 1, limit: 50 }
): UseQueryResult<ApiResponse<Message[]>, ApiError> {
    return useQuery({
        queryKey: ['messages', params],
        queryFn: async () => {
            const queryParams = new URLSearchParams({
                page: String(params.page || 1),
                limit: String(params.limit || 50),
            });
            return apiClient.get<Message[]>(`/api/messages?${queryParams}`);
        },
        staleTime: 30 * 1000, // 30초
    });
}
