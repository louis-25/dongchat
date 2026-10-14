"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFriendsList, usePendingFriends } from "@/hooks/useFriends";
import { AddFriendForm } from "./components/AddFriendForm";
import { PendingRequestsList } from "./components/PendingRequestsList";
import { FriendsList } from "./components/FriendsList";
import { useFriendsActions } from "./hooks/useFriendsActions";

const FriendsTab = () => {
  const { data: friends = [], isFetching: friendsFetching } = useFriendsList();
  const { data: pending = [], isFetching: pendingFetching } = usePendingFriends();
  const { sendFriendRequest, respondFriendRequest, isRequestPending, isResponding } = useFriendsActions();

  return (
    <Card>
      <CardHeader>
        <CardTitle>친구 관리</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AddFriendForm onSubmit={sendFriendRequest} disabled={isRequestPending} />
        <PendingRequestsList
          pending={pending}
          isLoading={pendingFetching}
          onRespond={respondFriendRequest}
          isResponding={isResponding}
        />
        <FriendsList friends={friends} isLoading={friendsFetching} />
      </CardContent>
    </Card>
  );
};

export default FriendsTab;
