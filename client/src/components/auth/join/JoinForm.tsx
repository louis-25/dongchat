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
import { useNextParam } from "@/hooks/useNextParam";
import { getErrorMessage } from "@/lib/error-handler";
import { signInWithKakao, signUp } from "@/services/auth";
import type { DomainError } from "@/types/domain";

const joinSchema = yup.object({
  email: yup.string().email("이메일 형식이 아닙니다.").required("이메일을 입력해주세요."),
  username: yup
    .string()
    .matches(/^[a-zA-Z0-9_]{3,20}$/, "아이디는 영문·숫자·밑줄 3~20자입니다.")
    .required("아이디를 입력해주세요."),
  password: yup.string().min(6, "비밀번호는 6자 이상입니다.").required("비밀번호를 입력해주세요."),
});

type JoinFormValues = yup.InferType<typeof joinSchema>;

const JoinForm = () => {
  const { router } = useRouter();
  const next = useNextParam();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const methods = useForm<JoinFormValues>({ resolver: yupResolver(joinSchema) });

  const join = useMutation({
    mutationFn: signUp,
    onSuccess: async ({ needsEmailConfirmation }) => {
      // 이메일 확인이 켜진 환경(운영)에서는 세션이 없다.
      if (needsEmailConfirmation) {
        success("가입 완료! 메일함에서 인증 후 로그인해주세요.");
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      success("회원가입 완료!");
      router.replace(next);
    },
    onError: (e) => error(`회원가입 실패: ${getErrorMessage(e as unknown as DomainError)}`),
  });

  const kakao = useMutation({
    mutationFn: () => signInWithKakao(next),
    onError: (e) => error(`카카오 로그인 실패: ${getErrorMessage(e as unknown as DomainError)}`),
  });

  const busy = join.isPending || kakao.isPending;

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit((data) => join.mutate(data))} className="space-y-4 mt-4">
        <FormInput name="email" label="이메일" type="email" placeholder="이메일을 입력하세요" disabled={busy} />
        <FormInput name="username" label="아이디" placeholder="친구가 검색할 아이디" disabled={busy} />
        <FormInput name="password" label="비밀번호" type="password" placeholder="6자 이상" disabled={busy} />
        <Button type="submit" className="w-full" disabled={busy}>
          {join.isPending ? "가입 중..." : "회원가입"}
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

export default JoinForm;
