'use client';

import { useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import useRouter from "@/hooks/useRouter";
import { accessTokenAtom, userAtom } from "@/store/auth";
import { setAccessToken } from "@/lib/api-client";
import type { AuthResponseDtoUser } from "@/lib/api/models";
import { cn } from "@/lib/utils";

type ProtectedHeaderProps = {
    user: AuthResponseDtoUser | null;
};

const ProtectedHeader = ({ user }: ProtectedHeaderProps) => {
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [, setAccessTokenAtom] = useAtom(accessTokenAtom);
    const [, setUser] = useAtom(userAtom);
    const { goLogin, router } = useRouter();

    const initials = typeof user === "object" && user && "username" in user
        ? String((user as any).username || "").charAt(0).toUpperCase() || "?"
        : "?";

    const username = typeof user === "object" && user && "username" in user
        ? String((user as any).username || "")
        : "알 수 없음";

    const userId = typeof user === "object" && user && "id" in user
        ? String((user as any).id ?? "-")
        : "-";

    const handleLogout = () => {
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        setAccessToken(null);
        setAccessTokenAtom(null);
        setUser(null);
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
                    <button onClick={() => router.push("/chat")} className="hover:text-blue-600">
                        DongChat
                    </button>
                    {(user as any)?.role === "ADMIN" && (
                        <button
                            onClick={() => router.push("/admin/users")}
                            className="text-sm text-gray-600 hover:text-blue-600"
                        >
                            관리자
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">안녕하세요, {username}님</span>
                    <div ref={menuRef} className="relative">
                        <button
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                            onClick={() => setIsMenuOpen((prev) => !prev)}
                            className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 shadow-sm transition hover:shadow"
                        >
                            <div
                                className={cn(
                                    "flex size-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white",
                                    !user && "bg-gray-400"
                                )}
                            >
                                {initials}
                            </div>
                        </button>
                        {isMenuOpen && (
                            <div className="absolute right-0 mt-2 w-56 rounded-md border border-gray-200 bg-white shadow-lg">
                                <div className="border-b px-4 py-3">
                                    <p className="text-sm font-semibold text-gray-900">{username}</p>
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

