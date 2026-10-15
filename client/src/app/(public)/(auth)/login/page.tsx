import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/login/LoginForm";

// ?next=를 읽는 클라 컴포넌트(useSearchParams)라 Suspense로 감싼다.
export default function LoginPage() {
  return (
    <Suspense>
      <AuthShell footer={{ text: "처음이신가요?", path: "/join", link: "회원가입" }}>
        <LoginForm />
      </AuthShell>
    </Suspense>
  );
}
