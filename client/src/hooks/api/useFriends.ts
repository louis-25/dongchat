import { useMutation } from "@tanstack/react-query";
import {
  useFriendsControllerList,
  useFriendsControllerPending,
  friendsControllerRequest,
  useFriendsControllerAccept,
  useFriendsControllerBlock,
} from "@/services/friends/friends";
import type { ErrorType } from "@/lib/api-client";

// 친구 목록 조회
export const useFriendsList = useFriendsControllerList;
// 받은 친구 요청 조회
export const usePendingFriends = useFriendsControllerPending;
// 친구 요청 보내기 (username을 body로 전송)
export const useSendFriendReq = () => {
  return useMutation({
    mutationFn: (username: string) => {
      return friendsControllerRequest({
        data: { username },
      });
    },
  });
};
// 친구 요청 수락
export const useAcceptFriendReq = useFriendsControllerAccept;
// 친구 요청 차단
export const useBlockFriendReq = useFriendsControllerBlock;
