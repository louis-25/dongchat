"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthControllerRegister } from "@/services";

/**
 * 회원가입 페이지 컴포넌트입니다.
 */
export default function SignupPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const router = useRouter();
    const registerMutation = useAuthControllerRegister();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        registerMutation.mutate(
            { data: { username, password } },
            {
                onSuccess: () => {
                    alert("회원가입 성공! 로그인해주세요.");
                    router.push("/auth/signin");
                },
                onError: (error) => {
                    alert(`회원가입 실패: ${error || "오류가 발생했습니다."}`);
                },
            }
        );
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">회원가입</CardTitle>
                    <CardDescription className="text-center">
                        새로운 계정을 생성하세요.
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
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                            {registerMutation.isPending ? "가입 중..." : "가입하기"}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="justify-center">
                    <p className="text-sm text-gray-600">
                        이미 계정이 있으신가요?{" "}
                        <Link href="/auth/signin" className="text-blue-600 hover:underline">
                            로그인
                        </Link>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
