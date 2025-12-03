/**
 * 서비스 레이어 - Orval 자동 생성 훅 export
 * React Query + Axios 기반
 */

// 인증 관련 훅
export {
    useAuthControllerRegister,
    useAuthControllerLogin,
    type AuthControllerRegisterMutationBody,
    type AuthControllerLoginMutationBody,
} from '@/lib/api/generated/인증/인증';

// 채팅 관련 훅
export {
    useChatControllerGetMessages,
} from '@/lib/api/generated/채팅/채팅';

// 모델 타입export
export type {
    ChatControllerGetMessagesParams,
    RegisterDto,
    LoginDto,
    AuthResponseDto,
    Message,
} from '@/lib/api/models';
