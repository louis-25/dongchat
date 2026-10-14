"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import { useRooms } from "@/hooks/useRooms";
import { displayName, roomTitle } from "@/types/domain";

// 지금 보고 있지 않은 방(또는 탭이 가려진 상태)의 새 메시지를 토스트로 알린다.
export function useInAppNotification() {
  const { onRoomEvent, isViewing, setPickedRoomId } = useChat();
  const { user } = useAuth();
  const { data: rooms = [] } = useRooms();
  const router = useRouter();
  const roomsRef = useRef(rooms);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    if (!user) return;
    return onRoomEvent((e) => {
      if (e.type !== "message" || e.message.senderId === user.id) return;
      if (isViewing(e.roomId) && document.visibilityState === "visible") return;
      const room = roomsRef.current.find((r) => r.id === e.roomId);
      const sender = room?.participants.find((p) => p.user.id === e.message.senderId)?.user;
      toast.info(`${sender ? displayName(sender) : "새 메시지"}: ${e.message.content}`, {
        description: room ? roomTitle(room, user.id) : undefined,
        action: {
          label: "열기",
          onClick: () => {
            setPickedRoomId(e.roomId);
            router.push("/chat/rooms");
          },
        },
        duration: 5000,
      });
    });
  }, [user, onRoomEvent, isViewing, setPickedRoomId, router]);
}
