import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useToast from "@/hooks/useToast";
import { getErrorMessage } from "@/lib/error-handler";
import { createRoom, listRooms } from "@/services/rooms";
import type { CreateRoomPayload } from "../types";

export const ROOMS_QUERY_KEY = ["rooms"] as const;

export const useChatRooms = () => {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [pickedRoomId, setSelectedRoomId] = useState<number | null>(null);

  const { data: rooms = [], isLoading } = useQuery({ queryKey: ROOMS_QUERY_KEY, queryFn: listRooms });

  // 선택은 파생값: 고른 방이 목록에서 사라지면(나가기·강퇴) 첫 방, 방이 없으면 null.
  const selectedRoomId = rooms.some((r) => r.id === pickedRoomId) ? pickedRoomId : (rooms[0]?.id ?? null);
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;

  const create = useMutation({
    mutationFn: createRoom,
    onSuccess: async (roomId) => {
      await queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });
      setSelectedRoomId(roomId);
      success("채팅방을 생성했습니다.");
    },
    onError: (e) => error(`채팅방 생성 실패: ${getErrorMessage(e)}`),
  });

  const handleCreateRoom = async (payload: CreateRoomPayload) => {
    try {
      await create.mutateAsync({ name: payload.name, isGroup: payload.isGroup, usernames: payload.participants });
      return true;
    } catch {
      return false; // 토스트는 onError에서
    }
  };

  return { rooms, selectedRoom, selectedRoomId, setSelectedRoomId, createRoom: handleCreateRoom, isLoading };
};
