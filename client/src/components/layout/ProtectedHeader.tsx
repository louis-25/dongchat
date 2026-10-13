"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import useRouter from "@/hooks/useRouter";
import { AUTH_QUERY_KEY } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { signOut } from "@/services/auth";
import type { AuthUser } from "@/types/domain";

type ProtectedHeaderProps = {
  user: AuthUser | null;
};

const ProtectedHeader = ({ user }: ProtectedHeaderProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { goLogin, router } = useRouter();
  const queryClient = useQueryClient();

  const displayName = user ? (user.nickname ?? user.username) : "";
  const initials = displayName ? displayName.charAt(0).toUpperCase() : "?";

  const handleLogout = async () => {
    await signOut();
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    setIsMenuOpen(false);
    goLogin();
  };

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  return (
    <header className="border-b bg-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="text-lg font-semibold text-gray-900 flex items-center gap-3">
          <button onClick={() => router.push("/chat/friends")} className="hover:text-blue-600">
            DongChat
          </button>
          {user?.isAdmin && (
            <button
              onClick={() => router.push("/admin/users")}
              className="text-sm text-gray-600 hover:text-blue-600"
            >
              관리자
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {displayName && <span className="text-sm text-gray-600">안녕하세요, {displayName}님</span>}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 shadow-sm transition hover:shadow"
            >
              <Avatar className="size-9">
                {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={displayName} /> : null}
                <AvatarFallback
                  className={cn("bg-blue-600 text-sm font-semibold text-white", !user && "bg-gray-400")}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-md border border-gray-200 bg-white shadow-lg">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                  {user && <p className="mt-1 text-xs text-gray-500">@{user.username}</p>}
                </div>
                <div className="p-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sm text-red-600 hover:bg-red-50"
                    onClick={handleLogout}
                  >
                    로그아웃
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default ProtectedHeader;
