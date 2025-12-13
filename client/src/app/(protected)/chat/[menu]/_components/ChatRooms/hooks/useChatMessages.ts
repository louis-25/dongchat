import { useEffect, useState } from "react";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import useToast from "@/hooks/useToast";
import type { IncomingMessage } from "../types";

export const useChatMessages = (selectedRoomId: number | null) => {
  const { socket } = useChat();
  const { user } = useAuth();
  const { error } = useToast();

  const [messagesByRoom, setMessagesByRoom] = useState<
    Record<number, { sender: string; message: string; createdAt?: string }[]>
  >({});

  // 방 입장 처리
  useEffect(() => {
    if (!socket || !user?.id || !selectedRoomId) return;
    socket.emit("join_room", { roomId: selectedRoomId, userId: user.id });
  }, [socket, user?.id, selectedRoomId]);

  // 메시지 수신 처리
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (payload: IncomingMessage) => {
      if (payload.roomId === undefined || payload.roomId === null) return;
      const roomKey = Number(payload.roomId);
      setMessagesByRoom((prev) => {
        const prevList = prev[roomKey] || [];
        return {
          ...prev,
          [roomKey]: [
            ...prevList,
            {
              sender: payload.sender,
              message: payload.content ?? payload.message ?? "",
              createdAt: payload.createdAt,
            },
          ],
        };
      });
    };

    const handleInitialMessages = (payload: {
      roomId: number;
      messages: IncomingMessage[];
    }) => {
      if (payload?.roomId === undefined || payload?.roomId === null) return;
      const roomKey = Number(payload.roomId);
      const formatted = (payload.messages || []).map((m) => ({
        sender: m.sender,
        message: m.content ?? m.message ?? "",
        createdAt: m.createdAt,
      }));
      setMessagesByRoom((prev) => ({ ...prev, [roomKey]: formatted }));
    };

    socket.on("message", handleMessage);
    socket.on("initial_messages", handleInitialMessages);

    return () => {
      socket.off("message", handleMessage);
      socket.off("initial_messages", handleInitialMessages);
    };
  }, [socket]);

  const sendMessage = (message: string) => {
    if (!selectedRoomId) {
      error("채팅방을 먼저 선택하세요.");
      return;
    }
    if (!socket || !user?.username) {
      error("메시지를 보낼 수 없습니다. 연결 상태를 확인하세요.");
      return;
    }
    if (!message.trim()) return;

    socket.emit("message", {
      sender: user.username,
      message: message.trim(),
      roomId: selectedRoomId,
    });
  };

  const currentMessages =
    selectedRoomId !== null ? messagesByRoom[selectedRoomId] || [] : [];

  return {
    currentMessages,
    sendMessage,
  };
};
