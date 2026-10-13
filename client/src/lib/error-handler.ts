// 도메인 에러 코드 → 사용자 메시지. 백엔드 응답 형태와 무관하게 { code, message }만 본다.
export const getErrorMessage = (error: { code?: string; message?: string } | null | undefined): string => {
  if (!error) {
    return '알 수 없는 오류가 발생했습니다.';
  }

  if (error.code) {
    switch (error.code) {
      case 'AUTH_USER_NOT_FOUND':
        return '사용자를 찾을 수 없습니다.';
      case 'AUTH_INVALID_PASSWORD':
      case 'AUTH_INVALID_CREDENTIALS':
        return '이메일 또는 비밀번호가 올바르지 않습니다.';
      case 'AUTH_DUPLICATE_USER':
        return '이미 사용 중인 아이디입니다.';
      case 'AUTH_DUPLICATE_EMAIL':
        return '이미 가입된 이메일입니다.';
      case 'AUTH_RATE_LIMITED':
        return '요청이 너무 많습니다. 잠시 후 다시 시도하세요.';
      case 'AUTH_SESSION_REVOKED':
        return '세션이 만료되었습니다. 다시 로그인해주세요.';
      case 'AUTH_UNAUTHORIZED':
        return '인증이 필요합니다.';
      case 'AUTH_FORBIDDEN':
        return '접근 권한이 없습니다.';
      case 'VALIDATION_FAILED':
        return '입력값이 올바르지 않습니다.';
      case 'CHAT_FORBIDDEN':
        return '해당 채팅에 접근할 권한이 없습니다.';
      case 'MESSAGE_NOT_FOUND':
        return '메시지를 찾을 수 없습니다.';
      case 'CHAT_ROOM_NOT_FOUND':
        return '채팅방을 찾을 수 없습니다.';
      default:
        return error.message || '오류가 발생했습니다.';
    }
  }

  return error.message || '서버와 통신 중 오류가 발생했습니다.';
};
