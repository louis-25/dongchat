import { useQuery } from "@tanstack/react-query";
import { listRooms } from "@/services/rooms";

export const ROOMS_QUERY_KEY = ["rooms"] as const;

// 내가 참여한 방. ChatProvider(채널 구독)와 채팅 탭이 같은 캐시를 쓴다.
export const useRooms = () => useQuery({ queryKey: ROOMS_QUERY_KEY, queryFn: listRooms });
