"use client";

import { useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import useRouter from "@/hooks/useRouter";
import { accessTokenAtom, userAtom, type User } from "@/store/auth";
import { setAccessToken } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";

type ProtectedHeaderProps = {
  user?: User | null;
};

// User 타입 가드
type UserWithFields = {
  id?: number;
  username?: string;
  role?: string;
  profileImage?: string;
};

const isUserWithFields = (user: unknown): user is UserWithFields => {
  return typeof user === "object" && user !== null;
};

const ProtectedHeader = ({ user: userProp }: ProtectedHeaderProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [, setAccessTokenAtom] = useAtom(accessTokenAtom);
  const [userFromAtom, setUser] = useAtom(userAtom);
  const { goLogin, router } = useRouter();
  const [isMounted, setIsMounted] = useState(() => false);

  // 클라이언트에서만 마운트 확인 (hydration mismatch 방지)
  useEffect(() => {
    // 비동기로 마운트 상태 업데이트하여 hydration mismatch 방지
    queueMicrotask(() => {
      setIsMounted(true);
    });

    // 초기 마운트 시 sessionStorage에서 사용자 정보 복원 (새로고침 대응)
    if (!userFromAtom && !userProp) {
      try {
        const storedUser = sessionStorage.getItem("user");
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
        }
      } catch (e) {
        console.error("Failed to parse user from sessionStorage", e);
      }
    }
  }, [userFromAtom, userProp, setUser]);

  // prop의 user가 있으면 사용하고, 없으면 atom에서 가져옴 (새로고침 대응)
  const user = userProp ?? userFromAtom;
  const userData = isUserWithFields(user) ? user : null;

  // hydration mismatch 방지를 위해 클라이언트에서만 실제 값 표시
  const initials =
    isMounted && userData?.username
      ? userData.username.charAt(0).toUpperCase() || "?"
      : "?";

  const username = isMounted && userData?.username ? userData.username : "";

  const userId = isMounted && userData?.id ? String(userData.id) : "";

  const profileImage = isMounted ? userData?.profileImage : undefined;

  const userRole = isMounted ? userData?.role : undefined;

  const handleLogout = async () => {
    try {
      // NextAuth 세션 정리 (카카오 로그인 세션 포함)
      await signOut({
        redirect: false, // 수동으로 리다이렉트 처리
        callbackUrl: "/login",
      });
    } catch (error) {
      console.error("NextAuth signOut error:", error);
    }

    // localStorage 정리 (refreshToken만)
    localStorage.removeItem("refreshToken");
    // sessionStorage 정리
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("accessToken");

    // atom 상태 초기화
    setAccessToken(null);
    setAccessTokenAtom(null);
    setUser(null);
    setIsMenuOpen(false);

    // 로그인 페이지로 리다이렉트
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
          <button
            onClick={() => router.push("/chat/friends")}
            className="hover:text-blue-600"
          >
            DongChat
          </button>
          {userRole === "ADMIN" && (
            <button
              onClick={() => router.push("/admin/users")}
              className="text-sm text-gray-600 hover:text-blue-600"
            >
              관리자
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isMounted && username && (
            <span className="text-sm text-gray-600">
              안녕하세요, {username}님
            </span>
          )}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 shadow-sm transition hover:shadow"
            >
              <Avatar className="size-9">
                {profileImage ? (
                  <AvatarImage src={profileImage} alt={username} />
                ) : null}
                <AvatarFallback
                  className={cn(
                    "bg-blue-600 text-sm font-semibold text-white",
                    !user && "bg-gray-400"
                  )}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-md border border-gray-200 bg-white shadow-lg">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {username}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">ID: {userId}</p>
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
