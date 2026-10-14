import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@/components/chat-provider";
import useToast from "@/hooks/useToast";
import { ROOMS_QUERY_KEY, useRooms } from "@/hooks/useRooms";
import { getErrorMessage } from "@/lib/error-handler";
import { createRoom, kickMember, leaveRoom } from "@/services/rooms";
import type { CreateRoomPayload } from "../types";

export const useChatRooms = () => {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  // 선택한 방은 provider에 둔다(친구 탭을 다녀와도, 알림 [열기]로도 유지·변경).
  const { pickedRoomId, setPickedRoomId: setSelectedRoomId } = useChat();

  const { data: rooms = [], isLoading } = useRooms();

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

  const refreshRooms = () => queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });

  const leave = useMutation({
    mutationFn: leaveRoom,
    onSuccess: async () => {
      await refreshRooms();
      success("채팅방에서 나왔습니다.");
    },
    onError: (e) => error(`나가기 실패: ${getErrorMessage(e)}`),
  });

  const kick = useMutation({
    mutationFn: ({ roomId, userId }: { roomId: number; userId: string }) => kickMember(roomId, userId),
    onSuccess: async () => {
      await refreshRooms();
      success("멤버를 강퇴했습니다.");
    },
    onError: (e) => error(`강퇴 실패: ${getErrorMessage(e)}`),
  });

  return {
    rooms,
    selectedRoom,
    selectedRoomId,
    setSelectedRoomId,
    createRoom: handleCreateRoom,
    leaveRoom: leave.mutate,
    kickMember: (roomId: number, userId: string) => kick.mutate({ roomId, userId }),
    isMutating: leave.isPending || kick.isPending,
    isLoading,
  };
};
