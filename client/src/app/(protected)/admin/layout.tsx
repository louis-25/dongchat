"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import useAuth from "@/hooks/useAuth";

const TABS = [
  { href: "/admin/users", label: "사용자" },
  { href: "/admin/rooms", label: "채팅방" },
  { href: "/admin/webhooks", label: "웹훅" },
];

// 화면 노출 가드. 실제 권한 판정은 DB(관리자 RPC·RLS)가 한다.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && user && !user.isAdmin) router.replace("/chat/rooms");
  }, [isLoading, user, router]);

  if (!user?.isAdmin) return null;

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href="/chat/rooms" className="text-sm text-muted-foreground hover:text-foreground">‹ 채팅으로</Link>
          <span className="font-semibold">관리자</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <nav className="flex gap-2">
          {TABS.map((tab) => (
            <Button key={tab.href} variant={pathname === tab.href ? "default" : "outline"} asChild>
              <Link href={tab.href}>{tab.label}</Link>
            </Button>
          ))}
        </nav>
        {children}
      </main>
    </div>
  );
}
