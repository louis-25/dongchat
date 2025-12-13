import { useEffect } from "react";
import { useAtom } from "jotai";
import { accessTokenAtom, userAtom } from "@/store/auth";
import useRouter from "./useRouter";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { setAccessToken } from "@/lib/api-client";

// 확장된 Session 타입 정의
type ExtendedSession = Session & {
  backendAccessToken?: string;
  backendRefreshToken?: string;
  backendUser?: {
    id: number;
    username: string;
    role?: string;
    profileImage?: string | null;
  };
};

const useAuth = () => {
  const { router } = useRouter();
  const [user, setUser] = useAtom(userAtom);
  const [, setAccessTokenAtom] = useAtom(accessTokenAtom);
  const { data: session, status } = useSession();

  // 인증 상태 확인 및 리다이렉트 처리
  useEffect(() => {
    // session이 없거나 로딩 중이면 처리하지 않음
    if (status === "loading" || !session) {
      return;
    }

    // 타입 안전하게 확장된 Session으로 변환
    const sessionWithBackend = session as unknown as ExtendedSession;
    const sessionAccess = sessionWithBackend.backendAccessToken;
    const sessionRefresh = sessionWithBackend.backendRefreshToken;
    const sessionUser = sessionWithBackend.backendUser;

    // NextAuth 세션이 있고 백엔드 정보가 있으면 사용
    if (sessionAccess && sessionRefresh && sessionUser) {
      // refreshToken만 localStorage에 저장
      localStorage.setItem("refreshToken", sessionRefresh);
      // 나머지는 sessionStorage와 전역 상태로 관리
      if (typeof window !== "undefined") {
        sessionStorage.setItem("user", JSON.stringify(sessionUser));
        sessionStorage.setItem("accessToken", sessionAccess);
      }
      setAccessToken(sessionAccess);
      setAccessTokenAtom(sessionAccess);
      setUser(sessionUser);
      return;
    }

    const refreshToken = localStorage.getItem("refreshToken");

    if (!refreshToken) {
      router.push("/login");
      return;
    }

    // 클라이언트에서만 sessionStorage에서 사용자 정보 복원 (hydration mismatch 방지)
    if (typeof window !== "undefined") {
      const storedUser = sessionStorage.getItem("user");
      const storedAccessToken = sessionStorage.getItem("accessToken");

      // sessionStorage에서 사용자 정보 복원
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
        } catch (e) {
          console.error("Failed to parse user from sessionStorage", e);
        }
      }

      // sessionStorage에서 액세스 토큰 복원
      if (storedAccessToken) {
        setAccessToken(storedAccessToken);
        setAccessTokenAtom(storedAccessToken);
      }
    }
    // refreshToken이 있으면 API 호출 시 자동으로 갱신됨
  }, [session, status, setUser, setAccessTokenAtom, router]);

  return { user };
};

export default useAuth;
