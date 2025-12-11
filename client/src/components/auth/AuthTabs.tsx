"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useMemo } from "react";
import LoginForm from "./login/LoginForm";
import JoinForm from "./join/JoinForm";
import useRouter from "@/hooks/useRouter";

export default function AuthTabs() {
  const { goLogin, goJoin, pathname } = useRouter();

  const activeTab = useMemo(
    () => (pathname === "/join" ? "join" : "login"),
    [pathname]
  );

  const handleTabChange = (value: string) => {
    if (value === "login") {
      goLogin();
    } else {
      goJoin();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Login</CardTitle>
          {/* <CardDescription className="text-center">
                        실시간 채팅 서비스에 오신 것을 환영합니다.
                    </CardDescription> */}
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">로그인</TabsTrigger>
              <TabsTrigger value="join">회원가입</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <LoginForm />
            </TabsContent>

            <TabsContent value="join">
              <JoinForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
