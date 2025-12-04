import { ErrorType } from './api-client';

export const getErrorMessage = (error: ErrorType<void>): string => {
    if (!error) {
        return '알 수 없는 오류가 발생했습니다.';
    }

    // 백엔드에서 전달된 code가 있는 경우
    if (error.code) {
        switch (error.code) {
            case 'AUTH_USER_NOT_FOUND':
                return '사용자를 찾을 수 없습니다.';
            case 'AUTH_INVALID_PASSWORD':
                return '비밀번호가 일치하지 않습니다.';
            case 'AUTH_DUPLICATE_USER':
                return '이미 존재하는 사용자 ID입니다.';
            case 'AUTH_UNAUTHORIZED':
                return '인증이 필요합니다.';
            case 'AUTH_FORBIDDEN':
                return '접근 권한이 없습니다.';
            case 'VALIDATION_FAILED':
                return '입력값이 올바르지 않습니다.';
            default:
                // 코드는 있지만 매핑되지 않은 경우 메시지 반환
                return error.message || '오류가 발생했습니다.';
        }
    }

    // 코드가 없는 경우 메시지 반환
    return error.message || '서버와 통신 중 오류가 발생했습니다.';
};
