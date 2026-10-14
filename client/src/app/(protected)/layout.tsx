"use client";
import { ChatProvider } from "@/components/chat-provider";
import ProtectedHeader from "@/components/layout/ProtectedHeader";
import useAuth from "@/hooks/useAuth";

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50">
      <ProtectedHeader user={user} />
      {/* Realtime 허브: 채팅(참여 방)과 관리자 방 열람(watchRoom)이 공유. 강제 로그아웃 통지도 여기서 받는다. */}
      <ChatProvider>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </ChatProvider>
    </div>
  );
};

export default ProtectedLayout;
