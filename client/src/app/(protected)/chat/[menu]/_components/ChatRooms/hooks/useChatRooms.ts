import { useCallback, useEffect, useMemo, useState } from "react";
import { BASE_URL } from "@/config";
import { getAccessToken } from "@/lib/api-client";
import useToast from "@/hooks/useToast";
import type { ChatRoom, CreateRoomPayload } from "../types";

export const useChatRooms = () => {
  const token = useMemo(() => getAccessToken(), []);
  const authHeader = useMemo(
    () =>
      token
        ? ({ Authorization: `Bearer ${token}` } as Record<string, string>)
        : ({} as Record<string, string>),
    [token]
  );

  const { success, error } = useToast();

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

  const loadRooms = useCallback(async () => {
    if (!token) {
      error("인증 정보가 없습니다. 다시 로그인 해주세요.");
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/chat/rooms`, {
        headers: authHeader,
      });
      if (res.ok) {
        const data = await res.json();
        setRooms(data || []);
        if (!selectedRoomId && data?.length > 0) {
          setSelectedRoomId(data[0].id);
        }
      } else {
        error("채팅방 목록을 불러오지 못했습니다.");
      }
    } catch (e) {
      console.error(e);
      error("채팅방 데이터를 불러오는 중 오류가 발생했습니다.");
    }
  }, [authHeader, error, selectedRoomId, token]);

  useEffect(() => {
    (async () => {
      await loadRooms();
    })();
  }, [loadRooms]);

  const createRoom = useCallback(
    async (payload: CreateRoomPayload) => {
      try {
        const res = await fetch(`${BASE_URL}/chat/rooms`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            name: payload.name,
            isGroup: payload.isGroup,
            participantUsernames: payload.participants,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          await loadRooms();
          setSelectedRoomId(data?.id ?? null);
          success("채팅방을 생성했습니다.");
          return true;
        } else {
          const errorData = await res.json().catch(() => null);
          error(errorData?.message || "채팅방 생성에 실패했습니다.");
          return false;
        }
      } catch (e) {
        console.error(e);
        const errorMessage =
          e instanceof Error ? e.message : "채팅방 생성 중 오류가 발생했습니다.";
        error(errorMessage);
        return false;
      }
    },
    [authHeader, error, loadRooms, success]
  );

  return {
    rooms,
    selectedRoomId,
    setSelectedRoomId,
    loadRooms,
    createRoom,
  };
};

