"use client";

import Link from "next/link";
import { useNextParam } from "@/hooks/useNextParam";

type Props = { children: React.ReactNode; footer: { text: string; path: string; link: string } };

// 로그인·가입 공통 틀. 서로 오가는 링크도 ?next=를 유지한다(초대 링크로 들어온 경우).
export function AuthShell({ children, footer }: Props) {
  const next = useNextParam();
  const href = next === "/chat/rooms" ? footer.path : `${footer.path}?next=${encodeURIComponent(next)}`;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-[calc(2rem+env(safe-area-inset-top))]">
      <h1 className="text-center text-4xl font-extrabold tracking-tight text-primary">dongchat</h1>
      <p className="mb-10 mt-2 text-center text-muted-foreground">친구들과 가볍게 대화해요</p>
      {children}
      <p className="mt-8 text-center text-sm text-muted-foreground">
        {footer.text}{" "}
        <Link href={href} className="font-semibold text-primary">{footer.link}</Link>
      </p>
    </main>
  );
}
