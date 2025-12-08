import { Button } from "@/components/ui/button";
import { useJoin } from "@/hooks/api/useAuthMutation";
import useRouter from "@/hooks/useRouter";
import useToast from "@/hooks/useToast";
import { getErrorMessage } from "@/lib/error-handler";
import { useForm, FormProvider } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import FormInput from "@/components/common/RHF/FormInput";

const joinSchema = yup.object().shape({
    username: yup.string().required("아이디를 입력해주세요."),
    password: yup.string().required("비밀번호를 입력해주세요."),
});

type JoinFormValues = yup.InferType<typeof joinSchema>;

const JoinForm = () => {
    const joinMutation = useJoin();
    const { success, error } = useToast();
    const { goLogin } = useRouter();

    const methods = useForm<JoinFormValues>({
        resolver: yupResolver(joinSchema),
    });

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
            <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-4 mt-4">
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
                <Button type="submit" className="w-full" disabled={joinMutation.isPending}>
                    {joinMutation.isPending ? "가입하기" : "회원가입"}
                </Button>
            </form>
        </FormProvider>
    );
};

export default JoinForm;