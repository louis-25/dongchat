"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthControllerLogin } from "@/services/auth/auth";
import { getErrorMessage } from "@/lib/error-handler";
import { useSetAtom } from "jotai";
import { userAtom } from "@/store/auth";
import { setAccessToken } from "@/lib/api-client";
import useToast from "@/hooks/useToast";

/**
 * 사용자 로그인을 위한 페이지 컴포넌트입니다.
 * auth.ts의 useAuthControllerLogin 훅을 사용하여 인증을 처리합니다.
 */
export default function SignInPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const router = useRouter();
    const setUser = useSetAtom(userAtom);
    const { success, error } = useToast()

    // 이미 로그인한 사용자는 채팅 페이지로 리다이렉트
    useEffect(() => {
        const refreshToken = localStorage.getItem("refreshToken");
        const user = localStorage.getItem("user");

        if (refreshToken && user) {
            router.push("/chat");
        }
    }, [router]);

    const { mutate: login, isPending: isLoading } = useAuthControllerLogin({
        mutation: {
            onSuccess: (data) => {
                console.log("Login successful:", data);

                // Refresh Token은 localStorage에 저장
                if (data.refresh_token) {
                    localStorage.setItem("refreshToken", data.refresh_token);
                }

                // Access Token은 전역 상태에 저장
                if (data.access_token) {
                    setAccessToken(data.access_token);
                }

                // 사용자 정보 저장
                if (data.user) {
                    localStorage.setItem("user", JSON.stringify(data.user));
                    setUser(data.user); // Jotai atom 업데이트
                }

                success("로그인 성공!");
                router.push("/chat");
            },
            onError: (e) => {
                console.error("Login error:", e);
                const message = getErrorMessage(e);
                error(`로그인 실패: ${message}`);
            },
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        login({ data: { username, password } });
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">로그인</CardTitle>
                    <CardDescription className="text-center">
                        서비스를 이용하려면 로그인하세요.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">아이디</Label>
                            <Input
                                id="username"
                                type="text"
                                placeholder="아이디를 입력하세요"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                disabled={isLoading}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">비밀번호</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="비밀번호를 입력하세요"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={isLoading}
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? "로그인 중..." : "로그인"}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="justify-center">
                    <p className="text-sm text-gray-600">
                        계정이 없으신가요?{" "}
                        <Link href="/auth/signup" className="text-blue-600 hover:underline">
                            회원가입
                        </Link>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
