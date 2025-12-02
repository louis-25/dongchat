import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { BASE_URL } from '@/config';

/**
 * API 응답 타입
 */
export interface ApiResponse<T = any> {
    data: T;
    status: number;
    message?: string;
}

/**
 * API 에러 타입
 */
export interface ApiError {
    message: string;
    status?: number;
    code?: string;
}

/**
 * Axios 인스턴스 생성
 * 기본 설정 및 인터셉터 적용
 */
class ApiClient {
    private instance: AxiosInstance;

    constructor() {
        this.instance = axios.create({
            baseURL: BASE_URL,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        this.setupInterceptors();
    }

    /**
     * 요청/응답 인터셉터 설정
     */
    private setupInterceptors() {
        // 요청 인터셉터
        this.instance.interceptors.request.use(
            (config) => {
                console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, {
                    params: config.params,
                    data: config.data,
                });
                return config;
            },
            (error) => {
                console.error('[API Request Error]', error);
                return Promise.reject(error);
            }
        );

        // 응답 인터셉터
        this.instance.interceptors.response.use(
            (response) => {
                console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`, {
                    status: response.status,
                    data: response.data,
                });
                return response;
            },
            (error: AxiosError) => {
                return this.handleError(error);
            }
        );
    }

    /**
     * 에러 핸들링
     */
    private handleError(error: AxiosError): Promise<never> {
        const apiError: ApiError = {
            message: '요청 처리 중 오류가 발생했습니다.',
            status: error.response?.status,
            code: error.code,
        };

        if (error.response) {
            // 서버 응답이 있는 경우
            const { status, data } = error.response;
            apiError.status = status;
            apiError.message = (data as any)?.message || `서버 오류 (${status})`;

            console.error(`[API Error] ${status}:`, {
                url: error.config?.url,
                method: error.config?.method,
                message: apiError.message,
                data: data,
            });
        } else if (error.request) {
            // 요청은 보냈으나 응답이 없는 경우
            apiError.message = '서버로부터 응답이 없습니다.';
            console.error('[API Error] No response:', error.request);
        } else {
            // 요청 설정 중 오류가 발생한 경우
            apiError.message = error.message;
            console.error('[API Error] Request setup:', error.message);
        }

        return Promise.reject(apiError);
    }

    /**
     * GET 요청
     */
    async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        const response = await this.instance.get<T>(url, config);
        return {
            data: response.data,
            status: response.status,
        };
    }

    /**
     * POST 요청
     */
    async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        const response = await this.instance.post<T>(url, data, config);
        return {
            data: response.data,
            status: response.status,
        };
    }

    /**
     * PUT 요청
     */
    async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        const response = await this.instance.put<T>(url, data, config);
        return {
            data: response.data,
            status: response.status,
        };
    }

    /**
     * DELETE 요청
     */
    async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        const response = await this.instance.delete<T>(url, config);
        return {
            data: response.data,
            status: response.status,
        };
    }

    /**
     * PATCH 요청
     */
    async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        const response = await this.instance.patch<T>(url, data, config);
        return {
            data: response.data,
            status: response.status,
        };
    }

    /**
     * Axios 인스턴스 반환 (고급 사용)
     */
    getAxiosInstance(): AxiosInstance {
        return this.instance;
    }
}

// 싱글톤 인스턴스 생성 및 export
export const apiClient = new ApiClient();
export default apiClient;
