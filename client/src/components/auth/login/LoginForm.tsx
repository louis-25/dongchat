"use client";

import { useForm, FormProvider } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import FormInput from "@/components/common/RHF/FormInput";
import useRouter from "@/hooks/useRouter";
import useToast from "@/hooks/useToast";
import { AUTH_QUERY_KEY } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/error-handler";
import { signIn, signInWithKakao } from "@/services/auth";
import type { DomainError } from "@/types/domain";

const loginSchema = yup.object({
  email: yup.string().email("이메일 형식이 아닙니다.").required("이메일을 입력해주세요."),
  password: yup.string().required("비밀번호를 입력해주세요."),
});

type LoginFormValues = yup.InferType<typeof loginSchema>;

const LoginForm = () => {
  const { goChat } = useRouter();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const methods = useForm<LoginFormValues>({ resolver: yupResolver(loginSchema) });

  const login = useMutation({
    mutationFn: signIn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      success("로그인 성공!");
      goChat();
    },
    onError: (e) => error(`로그인 실패: ${getErrorMessage(e as unknown as DomainError)}`),
  });

  // 성공 시 카카오로 페이지가 이동하므로 pending이 풀리지 않는 것이 정상이다.
  const kakao = useMutation({
    mutationFn: signInWithKakao,
    onError: (e) => error(`카카오 로그인 실패: ${getErrorMessage(e as unknown as DomainError)}`),
  });

  const busy = login.isPending || kakao.isPending;

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit((data) => login.mutate(data))} className="space-y-4 mt-4">
        <FormInput name="email" label="이메일" type="email" placeholder="이메일을 입력하세요" disabled={busy} />
        <FormInput name="password" label="비밀번호" type="password" placeholder="비밀번호를 입력하세요" disabled={busy} />
        <Button type="submit" className="w-full" disabled={busy}>
          {login.isPending ? "로그인 중..." : "로그인"}
        </Button>
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">또는</span>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => kakao.mutate()}
          className="w-full bg-[#FEE500] text-[#000000] hover:bg-[#FEE500]/90"
          disabled={busy}
        >
          {kakao.isPending ? "카카오 로그인 중..." : "카카오로 시작하기"}
        </Button>
      </form>
    </FormProvider>
  );
};

export default LoginForm;
