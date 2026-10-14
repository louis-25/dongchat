import { useQuery } from "@tanstack/react-query";
import { listFriends, listPending } from "@/services/friends";

export const FRIENDS_QUERY_KEY = ["friends"] as const;

export const useFriendsList = () => useQuery({ queryKey: [...FRIENDS_QUERY_KEY, "list"], queryFn: listFriends });
export const usePendingFriends = () => useQuery({ queryKey: [...FRIENDS_QUERY_KEY, "pending"], queryFn: listPending });
