"use client";

import { SessionProvider } from "next-auth/react";
import { ChatProvider } from "@/components/chat-provider";
import { ReactQueryProvider } from "@/components/react-query-provider";

/**
 * 애플리케이션 전역에 필요한 Provider들을 관리하는 컴포넌트입니다.
 * ReactQueryProvider: React Query 상태 관리
 * SessionProvider: NextAuth 세션 관리
 * ChatProvider: Socket.io 채팅 연결 관리
 */
export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ReactQueryProvider>
            <SessionProvider>
                <ChatProvider>
                    {children}
                </ChatProvider>
            </SessionProvider>
        </ReactQueryProvider>
    );
}
