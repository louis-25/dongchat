import { useRouter } from "next/navigation";
import useToast from "@/hooks/useToast";
import { useAtom } from "jotai";
import { accessTokenAtom, userAtom } from "@/store/auth";
import { useLogin } from "@/hooks/api/useAuthMutation";
import { getErrorMessage } from "@/lib/error-handler";
import { Button } from "@/components/ui/button";
import { setAccessToken } from "@/lib/api-client";
import { useForm, FormProvider } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import FormInput from "@/components/common/RHF/FormInput";

const loginSchema = yup.object().shape({
    username: yup.string().required("아이디를 입력해주세요."),
    password: yup.string().required("비밀번호를 입력해주세요."),
});

type LoginFormValues = yup.InferType<typeof loginSchema>;

const LoginForm = () => {
    const router = useRouter();
    const loginMutation = useLogin();
    const [user, setUser] = useAtom(userAtom);
    const [accessToken, setAccessTokenAtom] = useAtom(accessTokenAtom);
    const { success, error } = useToast();

    const methods = useForm<LoginFormValues>({
        resolver: yupResolver(loginSchema),
    });
    const { handleSubmit } = methods;

    const onSubmit = (data: LoginFormValues) => {
        loginMutation.mutate(
            { data: { username: data.username, password: data.password } },
            {
                onSuccess: (data) => {
                    if (data.refresh_token) {
                        localStorage.setItem("refreshToken", data.refresh_token);
                    }
                    if (data.access_token) {
                        setAccessToken(data.access_token);
                        setAccessTokenAtom(data.access_token);
                    }
                    if (data.user) {
                        localStorage.setItem("user", JSON.stringify(data.user));
                        setUser(data.user);
                    }
                    success("로그인 성공!");
                    router.push("/chat");
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
                <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                    {loginMutation.isPending ? "로그인 중..." : "로그인"}
                </Button>
            </form>
        </FormProvider>
    );
};

export default LoginForm;