import { AuthShell } from "@/components/auth/AuthShell";
import JoinForm from "@/components/auth/join/JoinForm";

export default function JoinPage() {
  return (
    <AuthShell footer={{ text: "이미 계정이 있나요?", href: "/login", link: "로그인" }}>
      <JoinForm />
    </AuthShell>
  );
}
