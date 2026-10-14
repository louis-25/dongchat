"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import useAuth from "@/hooks/useAuth";
import { ROOMS_QUERY_KEY, useRooms } from "@/hooks/useRooms";
import { getErrorMessage } from "@/lib/error-handler";
import { getCurrentSessionId, signOut } from "@/services/auth";
import { subscribeRoom, subscribeUser } from "@/services/realtime";
import type { Room, RoomEvent } from "@/types/domain";

type RoomListener = (e: RoomEvent) => void;

type ChatContextValue = {
  // 참여 중인 모든 방의 이벤트를 받는다. 반환값으로 해제.
  onRoomEvent: (listener: RoomListener) => () => void;
  // 채팅 탭에서 고른 방(탭을 오가도 유지). 인앱 알림 [열기]도 이 값을 바꾼다.
  pickedRoomId: number | null;
  setPickedRoomId: (id: number | null) => void;
  // 지금 화면에 열려 있는 방(채팅 탭이 아니면 null). 알림 판단용이라 렌더하지 않는다.
  setViewingRoom: (id: number | null) => void;
  isViewing: (id: number) => boolean;
  // 참여하지 않은 방도 room 채널을 구독한다(관리자 열람). 반환값으로 해제.
  watchRoom: (roomId: number) => () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat은 ChatProvider 안에서만 사용할 수 있습니다.");
  return ctx;
};

// Realtime 구독 허브(§8.3): 참여 중인 방마다 room 채널, 본인 user 채널 하나.
export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const { data: rooms = [] } = useRooms();
  const listeners = useRef(new Set<RoomListener>());
  const roomSubs = useRef(new Map<number, () => void>());
  const viewingRoom = useRef<number | null>(null);
  const [pickedRoomId, setPickedRoomId] = useState<number | null>(null);
  const [watched, setWatched] = useState<number[]>([]);

  const refreshRooms = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY }),
    [queryClient],
  );

  // 내가 빠진 방은 응답을 기다리지 않고 캐시에서 바로 뺀다 → 선택 이동·채널 해제가 즉시 일어난다(§8.3).
  const dropRoom = useCallback(
    (roomId: number) => queryClient.setQueryData<Room[]>(ROOMS_QUERY_KEY, (prev) => prev?.filter((r) => r.id !== roomId)),
    [queryClient],
  );

  const emit = useCallback(
    (e: RoomEvent) => {
      // 멤버 변동(강퇴·나가기·방장 승계)은 방 목록·참여자에 반영
      if (e.type === "member_removed") {
        if (e.userId === userId) dropRoom(e.roomId);
        void refreshRooms();
      }
      listeners.current.forEach((listener) => listener(e));
    },
    [refreshRooms, dropRoom, userId],
  );

  // 방 채널은 목록과의 차이만 구독/해제한다(같은 토픽을 해제 직후 다시 만들면 해제 중인 채널을 돌려받을 수 있음).
  useEffect(() => {
    const subs = roomSubs.current;
    if (!userId) return;
    const wanted = new Set([...rooms.map((r) => r.id), ...watched]);
    for (const [id, unsubscribe] of subs) {
      if (!wanted.has(id)) {
        unsubscribe();
        subs.delete(id);
      }
    }
    for (const id of wanted) {
      if (!subs.has(id)) subs.set(id, subscribeRoom(id, emit));
    }
  }, [rooms, watched, userId, emit]);

  useEffect(() => {
    const subs = roomSubs.current;
    return () => {
      subs.forEach((unsubscribe) => unsubscribe());
      subs.clear();
    };
  }, []);

  // 본인 채널: 방 초대·제외는 목록 갱신, 강제 로그아웃은 즉시 로그아웃(§9).
  useEffect(() => {
    if (!userId) return;
    return subscribeUser(userId, async (e) => {
      if (e.type !== "force_logout") {
        if (e.type === "member_removed") dropRoom(e.roomId); // 방 채널 권한이 사라져 room 이벤트는 못 받을 수 있다
        void refreshRooms();
        return;
      }
      // 다른 기기의 세션 삭제(그 기기 로그아웃)는 무시한다. 내 탭에서 로그아웃한 직후라면 세션이 없어 역시 무시
      // (로컬 세션이 먼저 사라지는 경우는 이미 SIGNED_OUT으로 로그아웃된 상태다).
      if (e.sessionId && e.sessionId !== (await getCurrentSessionId())) return;
      toast.error(getErrorMessage({ code: "AUTH_SESSION_REVOKED" }), { id: "auth-session-revoked" });
      await signOut(); // SIGNED_OUT → useAuth가 캐시를 비우고 /login으로
    });
  }, [userId, refreshRooms, dropRoom]);

  const onRoomEvent = useCallback((listener: RoomListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const setViewingRoom = useCallback((id: number | null) => {
    viewingRoom.current = id;
  }, []);
  const isViewing = useCallback((id: number) => viewingRoom.current === id, []);
  const watchRoom = useCallback((roomId: number) => {
    setWatched((prev) => [...prev, roomId]);
    return () =>
      setWatched((prev) => {
        const i = prev.indexOf(roomId);
        return i < 0 ? prev : [...prev.slice(0, i), ...prev.slice(i + 1)];
      });
  }, []);

  const value = useMemo(
    () => ({ onRoomEvent, pickedRoomId, setPickedRoomId, setViewingRoom, isViewing, watchRoom }),
    [onRoomEvent, pickedRoomId, setViewingRoom, isViewing, watchRoom],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
