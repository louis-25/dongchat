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
      localStorage.setItem("refreshToken", sessionRefresh);
      localStorage.setItem("user", JSON.stringify(sessionUser));
      setAccessToken(sessionAccess);
      setAccessTokenAtom(sessionAccess);
      setUser(sessionUser);
      return;
    }

    const refreshToken = localStorage.getItem("refreshToken");
    const storedUser = localStorage.getItem("user");

    if (!refreshToken || !storedUser) {
      router.push("/login");
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      console.log("parsedUser", parsedUser);
      setUser(parsedUser);
      // refreshToken이 있으면 API 호출 시 자동으로 갱신됨
    } catch (e) {
      console.error("Failed to parse user from localStorage", e);
      router.push("/login");
    }
  }, [session, status, setUser, setAccessTokenAtom, router]);

  return { user };
};

export default useAuth;
