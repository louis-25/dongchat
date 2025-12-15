import { Button } from "@/components/ui/button";
import { useJoin } from "@/hooks/api/useAuthMutation";
import useRouter from "@/hooks/useRouter";
import useToast from "@/hooks/useToast";
import { getErrorMessage } from "@/lib/error-handler";
import { useForm, FormProvider } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import FormInput from "@/components/common/RHF/FormInput";
import { signIn } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useAtom } from "jotai";
import { accessTokenAtom, userAtom } from "@/store/auth";
import { setAccessToken } from "@/lib/api-client";
import type { Session } from "next-auth";
import type { AuthResponseDtoUser } from "@/lib/api/models";
import { AuthResponseDtoUserRole } from "@/lib/api/models";

const joinSchema = yup.object().shape({
  username: yup.string().required("아이디를 입력해주세요."),
  password: yup.string().required("비밀번호를 입력해주세요."),
});

type JoinFormValues = yup.InferType<typeof joinSchema>;

const JoinForm = () => {
  const joinMutation = useJoin();
  const { success, error } = useToast();
  const { goLogin, goChat } = useRouter();
  const { data: session, status } = useSession();
  const [isKakaoLoading, setIsKakaoLoading] = useState(false);
  const [, setUser] = useAtom(userAtom);
  const [, setAccessTokenAtom] = useAtom(accessTokenAtom);
  const processedSessionRef = useRef<string | null>(null);

  const methods = useForm<JoinFormValues>({
    resolver: yupResolver(joinSchema),
  });

  // 카카오 로그인/회원가입 성공 처리
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
          // sessionUser를 AuthResponseDtoUser 타입으로 변환
          const userData: AuthResponseDtoUser = {
            id: sessionUser.id,
            username: sessionUser.username,
            role: (sessionUser.role as AuthResponseDtoUserRole) || AuthResponseDtoUserRole.USER,
            profileImage: null,
          };
          // 나머지는 sessionStorage와 전역 상태로 관리
          sessionStorage.setItem("user", JSON.stringify(userData));
          sessionStorage.setItem("accessToken", sessionAccess);
          setAccessToken(sessionAccess);
          setAccessTokenAtom(sessionAccess);
          setUser(userData);
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

  const onSubmit = (data: JoinFormValues) => {
    joinMutation.mutate(
      { data: { username: data.username, password: data.password } },
      {
        onSuccess: () => {
          success("회원가입 성공! 로그인해주세요.");
          goLogin();
        },
        onError: (e) => {
          const message = getErrorMessage(e);
          error(`회원가입 실패: ${message}`);
        },
      }
    );
  };

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onSubmit)}
        className="space-y-4 mt-4"
      >
        <FormInput
          name="username"
          label="아이디"
          placeholder="아이디를 입력하세요"
          disabled={joinMutation.isPending}
        />
        <FormInput
          name="password"
          label="비밀번호"
          type="password"
          placeholder="비밀번호를 입력하세요"
          disabled={joinMutation.isPending}
        />
        <Button
          type="submit"
          className="w-full"
          disabled={joinMutation.isPending}
        >
          {joinMutation.isPending ? "가입하기" : "회원가입"}
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
          disabled={isKakaoLoading || joinMutation.isPending}
        >
          {isKakaoLoading ? "카카오 로그인 중..." : "카카오로 시작하기"}
        </Button>
      </form>
    </FormProvider>
  );
};

export default JoinForm;
