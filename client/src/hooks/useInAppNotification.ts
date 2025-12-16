"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import { toast } from "sonner";
import { usePathname } from "next/navigation";

interface IncomingMessage {
  roomId?: number;
  sender: string;
  message?: string;
  content?: string;
  createdAt?: string;
}

/**
 * 인앱 알림 훅
 * 현재 열려있는 채팅방이 아닌 경우에만 알림 표시
 */
export function useInAppNotification() {
  const { socket } = useChat();
  const { user } = useAuth();
  const pathname = usePathname();
  const currentRoomIdRef = useRef<number | null>(null);

  // 현재 경로에서 roomId 추출
  useEffect(() => {
    const match = pathname?.match(/\/chat\/(\d+)/);
    currentRoomIdRef.current = match ? Number(match[1]) : null;
  }, [pathname]);

  useEffect(() => {
    if (!socket || !user) return;

    const handleMessage = (payload: IncomingMessage) => {
      // 메시지가 없거나 발신자가 본인이면 무시
      if (!payload.message && !payload.content) return;
      if (payload.sender === user.username) return;

      const messageRoomId = payload.roomId;
      const currentRoomId = currentRoomIdRef.current;

      // 현재 열려있는 채팅방이 아니거나, 다른 탭/창에 있을 때만 알림 표시
      if (messageRoomId !== currentRoomId || document.hidden) {
        const messageText = payload.content || payload.message || "";
        
        toast.info(`${payload.sender}: ${messageText}`, {
          description: messageRoomId ? `채팅방 #${messageRoomId}` : undefined,
          action: messageRoomId
            ? {
                label: "열기",
                onClick: () => {
                  window.location.href = `/chat/${messageRoomId}`;
                },
              }
            : undefined,
          duration: 5000,
        });
      }
    };

    socket.on("message", handleMessage);

    return () => {
      socket.off("message", handleMessage);
    };
  }, [socket, user]);
}

