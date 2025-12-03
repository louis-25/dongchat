import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
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
 */
const axiosInstance: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * 요청 인터셉터
 */
axiosInstance.interceptors.request.use(
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

/**
 * 에러 핸들링 함수
 */
const handleError = (error: AxiosError): Promise<never> => {
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
};

/**
 * 응답 인터셉터
 */
axiosInstance.interceptors.response.use(
    (response) => {
        console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`, {
            status: response.status,
            data: response.data,
        });
        return response;
    },
    handleError
);

/**
 * GET 요청
 */
export const get = async <T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    const response = await axiosInstance.get<T>(url, config);
    return {
        data: response.data,
        status: response.status,
    };
};

/**
 * POST 요청
 */
export const post = async <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    const response = await axiosInstance.post<T>(url, data, config);
    return {
        data: response.data,
        status: response.status,
    };
};

/**
 * PUT 요청
 */
export const put = async <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    const response = await axiosInstance.put<T>(url, data, config);
    return {
        data: response.data,
        status: response.status,
    };
};

/**
 * DELETE 요청
 */
export const del = async <T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    const response = await axiosInstance.delete<T>(url, config);
    return {
        data: response.data,
        status: response.status,
    };
};

/**
 * PATCH 요청
 */
export const patch = async <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
    const response = await axiosInstance.patch<T>(url, data, config);
    return {
        data: response.data,
        status: response.status,
    };
};

/**
 * Axios 인스턴스 가져오기 (고급 사용)
 */
export const getAxiosInstance = (): AxiosInstance => {
    return axiosInstance;
};

/**
 * Orval용 커스텀 인스턴스
 * Orval의 mutator로 사용됩니다.
 */
export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
    return axiosInstance.request<T>(config).then(({ data }) => data);
};

/**
 * 기본 export (객체 형태로 모든 메서드 제공)
 */
const apiClient = {
    get,
    post,
    put,
    delete: del,
    patch,
    getAxiosInstance,
};

export default apiClient;
