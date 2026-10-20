"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import { useRooms } from "@/hooks/useRooms";
import { ROOM_SUMMARIES_QUERY_KEY } from "@/hooks/useRoomSummaries";
import { markInAppNav } from "@/lib/nav";
import { roomPath } from "@/lib/push-url";
import { displayName, roomTitle, type RoomSummary } from "@/types/domain";

// 지금 보고 있지 않은 방(또는 탭이 가려진 상태)의 새 메시지를 토스트로 알린다.
export function useInAppNotification() {
  const { onRoomEvent, isViewing } = useChat();
  const { user } = useAuth();
  const { data: rooms = [] } = useRooms();
  const router = useRouter();
  const queryClient = useQueryClient();
  const roomsRef = useRef(rooms);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    if (!user) return;
    return onRoomEvent((e) => {
      if (e.type !== "message" || e.message.kind === "system" || e.message.senderId === user.id) return;
      if (isViewing(e.roomId) && document.visibilityState === "visible") return;
      const muted = queryClient.getQueryData<RoomSummary[]>(ROOM_SUMMARIES_QUERY_KEY)?.find((s) => s.id === e.roomId)?.muted;
      if (muted) return; // 알림 끈 방
      const room = roomsRef.current.find((r) => r.id === e.roomId);
      const sender = room?.participants.find((p) => p.user.id === e.message.senderId)?.user;
      toast.info(`${sender ? displayName(sender) : "새 메시지"}: ${e.message.content}`, {
        description: room ? roomTitle(room, user.id) : undefined,
        action: {
          label: "열기",
          onClick: () => {
            markInAppNav();
            router.push(roomPath(e.roomId));
          },
        },
        duration: 5000,
      });
    });
  }, [user, onRoomEvent, isViewing, router, queryClient]);
}
