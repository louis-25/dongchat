"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useChat } from "@/components/chat-provider";
import { ROOMS_QUERY_KEY } from "@/hooks/useRooms";
import { getErrorMessage } from "@/lib/error-handler";
import { getRoomNotice, setRoomNotice } from "@/services/rooms";
import type { DomainError } from "@/types/domain";

const noticeKey = (roomId: number) => [...ROOMS_QUERY_KEY, roomId, "notice"] as const;

// 방 공지. 등록·내리기(notice_updated)·공지 메시지 삭제·재구독(놓친 이벤트) 때 다시 받는다.
export const useRoomNotice = (roomId: number) => {
  const queryClient = useQueryClient();
  const { onRoomEvent } = useChat();
  const query = useQuery({ queryKey: noticeKey(roomId), queryFn: () => getRoomNotice(roomId) });

  useEffect(
    () =>
      onRoomEvent((e) => {
        if (e.roomId !== roomId) return;
        if (e.type === "notice_updated" || e.type === "message_deleted" || e.type === "subscribed") {
          void queryClient.invalidateQueries({ queryKey: noticeKey(roomId) });
        }
      }),
    [roomId, onRoomEvent, queryClient],
  );

  const set = useMutation({
    mutationFn: (messageId: number | null) => setRoomNotice(roomId, messageId),
    onSuccess: (_, messageId) => {
      void queryClient.invalidateQueries({ queryKey: noticeKey(roomId) });
      toast.success(messageId ? "공지로 등록했어요." : "공지를 내렸어요.");
    },
    onError: (e) => toast.error(getErrorMessage(e as unknown as DomainError)),
  });

  return { notice: query.data ?? null, setNotice: set.mutate, pending: set.isPending };
};

// 공지 띠 접기(이 기기). 접은 공지 id를 기억해 새 공지가 오면 다시 보인다.
const HIDDEN_EVENT = "dongchat:notice-hidden";
const hiddenKey = (roomId: number) => `dongchat.noticeHidden.${roomId}`;
const subscribeHidden = (onChange: () => void) => {
  window.addEventListener(HIDDEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(HIDDEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

export const useNoticeHidden = (roomId: number, messageId: number | null) => {
  const hiddenId = useSyncExternalStore(
    subscribeHidden,
    () => {
      try {
        return localStorage.getItem(hiddenKey(roomId));
      } catch {
        return null;
      }
    },
    () => null,
  );
  const hide = useCallback(() => {
    try {
      if (messageId !== null) localStorage.setItem(hiddenKey(roomId), String(messageId));
    } catch {
      // 저장 불가면 접히지 않는다
    }
    window.dispatchEvent(new Event(HIDDEN_EVENT));
  }, [roomId, messageId]);
  return [messageId !== null && hiddenId === String(messageId), hide] as const;
};
