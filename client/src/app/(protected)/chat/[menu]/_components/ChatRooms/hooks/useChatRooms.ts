import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useChatRoomsControllerList,
  useChatRoomsControllerCreate,
} from "@/services/chat-rooms/chat-rooms";
import useToast from "@/hooks/useToast";
import { getErrorMessage } from "@/lib/error-handler";
import type { ErrorType } from "@/lib/api-client";
import type { ChatRoom, CreateRoomPayload } from "../types";

export const useChatRooms = () => {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const hasInitializedRef = useRef(false);

  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

  // 채팅방 목록 조회 - react-query 사용
  const {
    data: rooms = [] as ChatRoom[],
    isLoading: roomsLoading,
    refetch: refetchRooms,
  } = useChatRoomsControllerList();

  // 채팅방 생성 - react-query mutation 사용
  const createRoomMutation = useChatRoomsControllerCreate({
    mutation: {
      onSuccess: () => {
        // 쿼리 무효화하여 목록 다시 불러오기
        queryClient.invalidateQueries({
          queryKey: ["/chat/rooms"],
        });
        success("채팅방을 생성했습니다.");
      },
      onError: (e: ErrorType<unknown>) => {
        const message = getErrorMessage(e);
        error(`채팅방 생성 실패: ${message}`);
      },
    },
  });

  // 방 목록이 로드되고 초기 선택이 필요할 때만 첫 번째 방 선택
  useEffect(() => {
    if (
      !hasInitializedRef.current &&
      rooms.length > 0 &&
      selectedRoomId === null
    ) {
      hasInitializedRef.current = true;
      // 비동기로 처리하여 effect 내부 setState 경고 완화
      queueMicrotask(() => {
        setSelectedRoomId(rooms[0]?.id);
      });
    }
  }, [rooms, selectedRoomId]);

  const createRoom = async (payload: CreateRoomPayload) => {
    try {
      await createRoomMutation.mutateAsync({
        data: {
          name: payload.name,
          isGroup: payload.isGroup,
          participantUsernames: payload.participants,
        },
      });
      // 성공 시 목록 다시 불러오기 (invalidateQueries로 자동 갱신됨)
      // 새로 불러온 목록에서 첫 번째 방 선택
      await refetchRooms();
      return true;
    } catch {
      // 에러는 mutation의 onError에서 처리됨
      return false;
    }
  };

  return {
    rooms,
    selectedRoomId,
    setSelectedRoomId,
    loadRooms: refetchRooms,
    createRoom,
    isLoading: roomsLoading,
  };
};
