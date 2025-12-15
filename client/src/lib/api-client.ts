import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";
import { BASE_URL, joinUrl } from "@/config";

// 토큰 관리를 위한 유틸리티
let currentAccessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  currentAccessToken = token;
};

export const getAccessToken = () => currentAccessToken;

/**
 * API 응답 타입
 */
export interface ApiResponse<T = unknown> {
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
 * 서버 에러 응답 타입
 */
interface ServerErrorResponse {
  message?: string;
  code?: string;
  [key: string]: unknown;
}

/**
 * Axios 인스턴스 생성
 */
const axiosInstance: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * 요청 인터셉터
 */
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 액세스 토큰이 있으면 Authorization 헤더에 추가
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, {
      params: config.params,
      data: config.data,
      hasAuth: !!token,
    });
    return config;
  },
  (error) => {
    console?.error("[API Request Error]", error);
    return Promise.reject(error);
  }
);

/**
 * 토큰 갱신 여부를 추적하는 플래그
 */
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * 에러 핸들링 함수
 */
const handleError = async (error: AxiosError): Promise<never> => {
  const originalRequest = error.config as InternalAxiosRequestConfig & {
    _retry?: boolean;
  };

  // 로그인/회원가입/토큰 갱신 API는 토큰 갱신 로직에서 제외
  const authEndpoints = [
    "/auth/login",
    "/auth/register",
    "/auth/refresh",
    "/auth/kakao",
  ];
  const isAuthEndpoint = authEndpoints.some((endpoint) =>
    originalRequest.url?.includes(endpoint)
  );

  // 401 에러이고 재시도하지 않은 요청이며, 인증 관련 엔드포인트가 아닌 경우에만 토큰 갱신 시도
  if (
    error.response?.status === 401 &&
    !originalRequest._retry &&
    !isAuthEndpoint
  ) {
    if (isRefreshing) {
      // 이미 토큰 갱신 중이면 대기
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => {
        return axiosInstance(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem("refreshToken");

    if (!refreshToken) {
      // Refresh token이 없으면 로그인 페이지로 이동
      processQueue(new Error("No refresh token"), null);
      isRefreshing = false;
      // refreshToken만 localStorage에서 제거
      localStorage.removeItem("refreshToken");
      // sessionStorage 정리
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("accessToken");
        sessionStorage.removeItem("user");
        window.location.href = "/login";
      }
      return Promise.reject(createApiError(error));
    }

    try {
      // Refresh token으로 새 토큰 발급
      const response = await axios.post(joinUrl(BASE_URL, "/auth/refresh"), {
        refresh_token: refreshToken,
      });
      const { access_token, refresh_token: newRefreshToken } = response.data;

      // 새 토큰 저장
      setAccessToken(access_token);
      // refreshToken만 localStorage에 저장
      localStorage.setItem("refreshToken", newRefreshToken);
      // accessToken은 sessionStorage에 저장
      if (typeof window !== "undefined") {
        sessionStorage.setItem("accessToken", access_token);
      }

      // 대기 중인 요청들 재시도
      processQueue(null, access_token);
      isRefreshing = false;

      // 원래 요청 재시도
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      // Refresh token도 만료된 경우
      processQueue(refreshError as Error, null);
      isRefreshing = false;
      // refreshToken만 localStorage에서 제거
      localStorage.removeItem("refreshToken");
      // sessionStorage 정리
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("accessToken");
        sessionStorage.removeItem("user");
        window.location.href = "/login";
      }
      return Promise.reject(refreshError);
    }
  }

  return Promise.reject(createApiError(error));
};

const createApiError = (error: AxiosError): ApiError => {
  const apiError: ApiError = {
    message: "요청 처리 중 오류가 발생했습니다.",
    status: error.response?.status,
    code: error.code,
  };

  if (error.response) {
    const { status, data } = error.response;
    const errorData = data as ServerErrorResponse;
    apiError.status = status;
    apiError.message = errorData?.message || `서버 오류 (${status})`;
    apiError.code = errorData?.code || error.code;

    console?.error(`[API Error] ${status}:`, {
      url: error.config?.url,
      method: error.config?.method,
      message: apiError.message,
      data: data,
    });
  } else if (error.request) {
    apiError.message = "서버로부터 응답이 없습니다.";
    console?.error("[API Error] No response:", error.request);
  } else {
    apiError.message = error.message;
    console?.error("[API Error] Request setup:", error.message);
  }

  return apiError;
};

/**
 * 응답 인터셉터
 */
axiosInstance.interceptors.response.use((response) => {
  console.log(
    `[API Response] ${response.config.method?.toUpperCase()} ${
      response.config.url
    }`,
    {
      status: response.status,
      data: response.data,
    }
  );
  return response;
}, handleError);

/**
 * GET 요청
 */
export const get = async <T = unknown>(
  url: string,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  const response = await axiosInstance.get<T>(url, config);
  return {
    data: response.data,
    status: response.status,
  };
};

/**
 * POST 요청
 */
export const post = async <T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  const response = await axiosInstance.post<T>(url, data, config);
  return {
    data: response.data,
    status: response.status,
  };
};

/**
 * PUT 요청
 */
export const put = async <T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  const response = await axiosInstance.put<T>(url, data, config);
  return {
    data: response.data,
    status: response.status,
  };
};

/**
 * DELETE 요청
 */
export const del = async <T = unknown>(
  url: string,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  const response = await axiosInstance.delete<T>(url, config);
  return {
    data: response.data,
    status: response.status,
  };
};

/**
 * PATCH 요청
 */
export const patch = async <T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
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
export const customInstance = async <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig
): Promise<T> => {
  const response = await axiosInstance.request<T>({
    ...config,
    ...(options ?? {}),
  });

  return response.data;
};

// Orval이 생성하는 React Query 훅에서 에러 타입 제네릭이 자동으로 ApiError로 맞춰진다.
// ex1) UseQueryResult<응답타입, ApiError>
// ex2) UseMutationResult<응답타입, ApiError, 변수타입>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ErrorType<TError = unknown> = ApiError;

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
