"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import { ROOMS_QUERY_KEY } from "@/hooks/useRooms";
import { applyRoomEvent } from "@/lib/room-list";
import { listMyRooms } from "@/services/rooms";
import type { RoomSummary } from "@/types/domain";

// ["rooms", ...] 아래라 방 목록을 무효화하면(방 생성·나가기·초대) 요약도 다시 받는다.
export const ROOM_SUMMARIES_QUERY_KEY = [...ROOMS_QUERY_KEY, "summaries"] as const;

export const useRoomSummaries = () => useQuery({ queryKey: ROOM_SUMMARIES_QUERY_KEY, queryFn: listMyRooms });

// 채팅 레이아웃에서 한 번만: 실시간 이벤트로 요약 캐시를 직접 고치고, 확신할 수 없으면 500ms 모아 다시 받는다.
export const useRoomSummariesSync = () => {
  const queryClient = useQueryClient();
  const { onRoomEvent, isViewing } = useChat();
  const { user } = useAuth();
  const me = user?.id;

  useEffect(() => {
    if (!me) return;
    let timer: number | undefined;
    const refetchSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ROOM_SUMMARIES_QUERY_KEY }), 500);
    };
    const off = onRoomEvent((e) => {
      const prev = queryClient.getQueryData<RoomSummary[]>(ROOM_SUMMARIES_QUERY_KEY);
      if (!prev) return;
      const { list, refetch } = applyRoomEvent(prev, e, {
        me,
        isViewing: (id) => isViewing(id) && document.visibilityState === "visible",
      });
      if (list !== prev) queryClient.setQueryData(ROOM_SUMMARIES_QUERY_KEY, list);
      if (refetch) refetchSoon();
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [queryClient, onRoomEvent, isViewing, me]);
};
