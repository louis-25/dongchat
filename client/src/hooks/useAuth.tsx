import { useEffect } from "react";
import { useAtom } from "jotai";
import { accessTokenAtom, userAtom } from "@/store/auth";
import useRouter from "./useRouter";
import { useSession } from "next-auth/react";
import { setAccessToken } from "@/lib/api-client";

const useAuth = () => {
  const { goLogin } = useRouter();
  const [user, setUser] = useAtom(userAtom);
  const [, setAccessTokenAtom] = useAtom(accessTokenAtom);
  const { data: session } = useSession();

  // 인증 상태 확인 및 리다이렉트 처리
  useEffect(() => {
    const sessionAccess = (session as any)?.backendAccessToken;
    const sessionRefresh = (session as any)?.backendRefreshToken;
    const sessionUser = (session as any)?.backendUser;

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
      goLogin();
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      // refreshToken이 있으면 API 호출 시 자동으로 갱신됨
    } catch (e) {
      console.error("Failed to parse user from localStorage", e);
      goLogin();
    }
  }, [session, setUser, setAccessTokenAtom, goLogin]);

  return { user };
};

export default useAuth;
