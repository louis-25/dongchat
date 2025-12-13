"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFriendsList, usePendingFriends } from "@/hooks/api/useFriends";
import { AddFriendForm } from "./components/AddFriendForm";
import { PendingRequestsList } from "./components/PendingRequestsList";
import { FriendsList } from "./components/FriendsList";
import { useFriendsActions } from "./hooks/useFriendsActions";

const FriendsTab = () => {
  // 친구 목록, 받은 요청 목록을 react-query로 관리
  const {
    data: friends = [],
    refetch: refetchFriends,
    isLoading: friendsLoading,
    isRefetching: friendsRefetching,
  } = useFriendsList();
  const {
    data: pending = [],
    refetch: refetchPending,
    isLoading: pendingLoading,
    isRefetching: pendingRefetching,
  } = usePendingFriends();

  const {
    sendFriendRequest,
    respondFriendRequest,
    isRequestPending,
    isResponding,
  } = useFriendsActions();

  const handleAddFriend = (username: string) => {
    sendFriendRequest(username, () => {
      refetchFriends();
      refetchPending();
    });
  };

  const handleRespond = (id: number, action: "accept" | "block") => {
    respondFriendRequest(id, action, () => {
      refetchFriends();
      refetchPending();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>친구 관리</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AddFriendForm onSubmit={handleAddFriend} disabled={isRequestPending} />
        <PendingRequestsList
          pending={pending}
          isLoading={pendingLoading}
          isRefetching={pendingRefetching}
          onRespond={handleRespond}
          isResponding={isResponding}
        />
        <FriendsList
          friends={friends}
          isLoading={friendsLoading}
          isRefetching={friendsRefetching}
        />
      </CardContent>
    </Card>
  );
};

export default FriendsTab;
