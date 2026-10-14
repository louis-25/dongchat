import { useMutation, useQueryClient } from "@tanstack/react-query";
import useToast from "@/hooks/useToast";
import { FRIENDS_QUERY_KEY } from "@/hooks/useFriends";
import { getErrorMessage } from "@/lib/error-handler";
import { respond, sendRequest } from "@/services/friends";
import type { FriendAction } from "@/types/domain";

export const useFriendsActions = () => {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_KEY });

  const request = useMutation({
    mutationFn: sendRequest,
    onSuccess: () => {
      success("친구 요청을 보냈습니다.");
      void refresh();
    },
    onError: (e) => error(`친구 요청 실패: ${getErrorMessage(e)}`),
  });

  const response = useMutation({
    mutationFn: ({ id, action }: { id: number; action: FriendAction }) => respond(id, action),
    onSuccess: (_data, { action }) => {
      success(action === "ACCEPT" ? "친구 요청을 수락했습니다." : "요청을 차단했습니다.");
      void refresh();
    },
    onError: (e) => error(`요청 처리 실패: ${getErrorMessage(e)}`),
  });

  return {
    sendFriendRequest: (username: string) => request.mutate(username.trim()),
    respondFriendRequest: (id: number, action: FriendAction) => response.mutate({ id, action }),
    isRequestPending: request.isPending,
    isResponding: response.isPending,
  };
};
