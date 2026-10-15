import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import JoinForm from "@/components/auth/join/JoinForm";

// ?next=를 읽는 클라 컴포넌트(useSearchParams)라 Suspense로 감싼다.
export default function JoinPage() {
  return (
    <Suspense>
      <AuthShell footer={{ text: "이미 계정이 있나요?", path: "/login", link: "로그인" }}>
        <JoinForm />
      </AuthShell>
    </Suspense>
  );
}
