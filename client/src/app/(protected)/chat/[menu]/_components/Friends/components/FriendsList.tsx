"use client";

import type { FriendEntry } from "../types";

type FriendsListProps = {
  friends: FriendEntry[];
  isLoading?: boolean;
  isRefetching?: boolean;
};

export const FriendsList = ({
  friends,
  isLoading = false,
  isRefetching = false,
}: FriendsListProps) => {
  return (
    <div>
      <h3 className="font-semibold mb-2">
        친구 목록
        <span className="ml-2 text-xs text-gray-500">
          {isLoading || isRefetching ? "불러오는 중..." : ""}
        </span>
      </h3>
      <div className="space-y-2">
        {friends.map((f) => (
          <div key={f.id} className="rounded border px-3 py-2">
            {f.friend.username}
          </div>
        ))}
        {friends.length === 0 && (
          <div className="text-sm text-gray-500">친구가 없습니다.</div>
        )}
      </div>
    </div>
  );
};

