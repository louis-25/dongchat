import useToast from "@/hooks/useToast";
import { useAtom } from "jotai";
import { accessTokenAtom, userAtom, type User } from "@/store/auth";
import { useLogin } from "@/hooks/api/useAuthMutation";
import { getErrorMessage } from "@/lib/error-handler";
import { Button } from "@/components/ui/button";
import { setAccessToken } from "@/lib/api-client";
import { useForm, FormProvider } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import FormInput from "@/components/common/RHF/FormInput";
import useRouter from "@/hooks/useRouter";
import { signIn } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";

const loginSchema = yup.object().shape({
  username: yup.string().required("아이디를 입력해주세요."),
  password: yup.string().required("비밀번호를 입력해주세요."),
});

type LoginFormValues = yup.InferType<typeof loginSchema>;

const LoginForm = () => {
  const { goChat } = useRouter();
  const loginMutation = useLogin();
  const [, setUser] = useAtom(userAtom);
  const [, setAccessTokenAtom] = useAtom(accessTokenAtom);
  const { success, error } = useToast();
  const { data: session, status } = useSession();
  const [isKakaoLoading, setIsKakaoLoading] = useState(false);
  const processedSessionRef = useRef<string | null>(null);

  const methods = useForm<LoginFormValues>({
    resolver: yupResolver(loginSchema),
  });
  const { handleSubmit } = methods;

  // 카카오 로그인 성공 처리
  useEffect(() => {
    if (status === "authenticated" && session && isKakaoLoading) {
      // 확장된 Session 타입으로 안전하게 접근
      type ExtendedSession = Session & {
        backendAccessToken?: string;
        backendRefreshToken?: string;
        backendUser?: {
          id: number;
          username: string;
          role?: string;
        };
      };
      const sessionWithBackend = session as unknown as ExtendedSession;

      const sessionId = sessionWithBackend.backendAccessToken;

      // 이미 처리한 세션인지 확인
      if (sessionId && processedSessionRef.current !== sessionId) {
        const sessionAccess = sessionWithBackend.backendAccessToken;
        const sessionRefresh = sessionWithBackend.backendRefreshToken;
        const sessionUser = sessionWithBackend.backendUser;

        if (sessionAccess && sessionRefresh && sessionUser) {
          processedSessionRef.current = sessionAccess;
          // refreshToken만 localStorage에 저장
          localStorage.setItem("refreshToken", sessionRefresh);
          // 나머지는 sessionStorage와 전역 상태로 관리
          sessionStorage.setItem("user", JSON.stringify(sessionUser));
          sessionStorage.setItem("accessToken", sessionAccess);
          setAccessToken(sessionAccess);
          setAccessTokenAtom(sessionAccess);
          setUser(sessionUser);
          success("카카오 로그인 성공!");
          setTimeout(() => {
            setIsKakaoLoading(false);
            goChat();
          }, 0);
        }
      }
    }
  }, [
    session,
    status,
    isKakaoLoading,
    setUser,
    setAccessTokenAtom,
    success,
    goChat,
  ]);

  const handleKakaoLogin = async () => {
    try {
      setIsKakaoLoading(true);
      await signIn("kakao", {
        callbackUrl: "/chat",
        redirect: true,
      });
    } catch {
      setIsKakaoLoading(false);
      error("카카오 로그인 실패");
    }
  };

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(
      { data: { username: data.username, password: data.password } },
      {
        onSuccess: (data) => {
          // refreshToken만 localStorage에 저장
          if (data.refresh_token) {
            localStorage.setItem("refreshToken", data.refresh_token);
          }
          // 나머지는 sessionStorage와 전역 상태로 관리
          if (data.access_token) {
            sessionStorage.setItem("accessToken", data.access_token);
            setAccessToken(data.access_token);
            setAccessTokenAtom(data.access_token);
          }
          if (data.user) {
            sessionStorage.setItem("user", JSON.stringify(data.user));
            // API 응답의 user를 User 타입으로 변환
            const userData = data.user as unknown as User;
            setUser(userData);
          }
          success("로그인 성공!");
          goChat();
        },
        onError: (e) => {
          const message = getErrorMessage(e);
          error(`로그인 실패: ${message}`);
        },
      }
    );
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
        <FormInput
          name="username"
          label="아이디"
          placeholder="아이디를 입력하세요"
          disabled={loginMutation.isPending}
        />
        <FormInput
          name="password"
          label="비밀번호"
          type="password"
          placeholder="비밀번호를 입력하세요"
          disabled={loginMutation.isPending}
        />
        <Button
          type="submit"
          className="w-full"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? "로그인 중..." : "로그인"}
        </Button>
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              또는
            </span>
          </div>
        </div>
        <Button
          type="button"
          onClick={handleKakaoLogin}
          className="w-full bg-[#FEE500] text-[#000000] hover:bg-[#FEE500]/90"
          disabled={isKakaoLoading || loginMutation.isPending}
        >
          {isKakaoLoading ? "카카오 로그인 중..." : "카카오로 시작하기"}
        </Button>
      </form>
    </FormProvider>
  );
};

export default LoginForm;
