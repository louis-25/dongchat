// NextAuth v5 Route Handler
// 설정은 별도의 auth.ts 파일에서 관리합니다
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
