"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import useToast from "@/hooks/useToast";
import { ROOMS_QUERY_KEY } from "@/hooks/useRooms";
import { getErrorMessage } from "@/lib/error-handler";
import { markInAppNav } from "@/lib/nav";
import { roomPath } from "@/lib/push-url";
import { createRoom, kickMember, leaveRoom, openDirectRoom } from "@/services/rooms";

// 방 만들기·1:1 열기·나가기·강퇴. 성공하면 목록(요약 포함)을 다시 받고 해당 화면으로 이동한다.
export const useRoomActions = () => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { success, error } = useToast();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });
  const enter = async (id: number) => {
    await refresh();
    markInAppNav();
    router.push(roomPath(id));
  };

  const create = useMutation({
    mutationFn: createRoom,
    onSuccess: enter,
    onError: (e) => error(`채팅방을 만들지 못했어요: ${getErrorMessage(e)}`),
  });
  const openDirect = useMutation({
    mutationFn: openDirectRoom,
    onSuccess: enter,
    onError: (e) => error(`대화를 열지 못했어요: ${getErrorMessage(e)}`),
  });
  const leave = useMutation({
    mutationFn: leaveRoom,
    onSuccess: async () => {
      router.replace("/chat/rooms");
      await refresh();
      success("채팅방에서 나왔어요.");
    },
    onError: (e) => error(`나가지 못했어요: ${getErrorMessage(e)}`),
  });
  const kick = useMutation({
    mutationFn: ({ roomId, userId }: { roomId: number; userId: string }) => kickMember(roomId, userId),
    onSuccess: async () => {
      await refresh();
      success("멤버를 내보냈어요.");
    },
    onError: (e) => error(`내보내지 못했어요: ${getErrorMessage(e)}`),
  });

  return {
    create: create.mutate,
    openDirect: openDirect.mutate,
    leave: leave.mutate,
    kick: (roomId: number, userId: string) => kick.mutate({ roomId, userId }),
    isPending: create.isPending || openDirect.isPending || leave.isPending || kick.isPending,
  };
};
