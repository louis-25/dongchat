import { AuthShell } from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/login/LoginForm";

export default function LoginPage() {
  return (
    <AuthShell footer={{ text: "처음이신가요?", href: "/join", link: "회원가입" }}>
      <LoginForm />
    </AuthShell>
  );
}
