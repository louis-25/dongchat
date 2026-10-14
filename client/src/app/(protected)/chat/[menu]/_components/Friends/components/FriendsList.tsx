"use client";

import { displayName, type Friend } from "@/types/domain";

type FriendsListProps = {
  friends: Friend[];
  isLoading?: boolean;
};

export const FriendsList = ({ friends, isLoading = false }: FriendsListProps) => {
  return (
    <div>
      <h3 className="font-semibold mb-2">
        친구 목록
        <span className="ml-2 text-xs text-gray-500">{isLoading ? "불러오는 중..." : ""}</span>
      </h3>
      <div className="space-y-2">
        {friends.map((f) => (
          <div key={f.id} className="rounded border px-3 py-2">
            {displayName(f.user)}
            <span className="ml-2 text-xs text-gray-500">@{f.user.username}</span>
          </div>
        ))}
        {friends.length === 0 && <div className="text-sm text-gray-500">친구가 없습니다.</div>}
      </div>
    </div>
  );
};
