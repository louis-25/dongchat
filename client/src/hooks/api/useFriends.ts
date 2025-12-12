import {
  useFriendsControllerList,
  useFriendsControllerPending,
  useFriendsControllerRequest,
  useFriendsControllerAccept,
  useFriendsControllerBlock,
} from "@/services/friends/friends";

// 친구 목록 조회
export const useFriendsList = useFriendsControllerList;
// 받은 친구 요청 조회
export const usePendingFriends = useFriendsControllerPending;
// 친구 요청 보내기
export const useSendFriendReq = useFriendsControllerRequest;
// 친구 요청 수락
export const useAcceptFriendReq = useFriendsControllerAccept;
// 친구 요청 차단
export const useBlockFriendReq = useFriendsControllerBlock;
