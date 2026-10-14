"use client";

import { Button } from "@/components/ui/button";
import { displayName, type FriendAction, type FriendRequest } from "@/types/domain";

type PendingRequestsListProps = {
  pending: FriendRequest[];
  isLoading?: boolean;
  onRespond: (id: number, action: FriendAction) => void;
  isResponding?: boolean;
};

export const PendingRequestsList = ({
  pending,
  isLoading = false,
  onRespond,
  isResponding = false,
}: PendingRequestsListProps) => {
  return (
    <div>
      <h3 className="font-semibold mb-2">
        받은 요청
        <span className="ml-2 text-xs text-gray-500">{isLoading ? "불러오는 중..." : ""}</span>
      </h3>
      <div className="space-y-2">
        {pending.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded border px-3 py-2">
            <span>
              {displayName(p.requester)}
              <span className="ml-2 text-xs text-gray-500">@{p.requester.username}</span>
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onRespond(p.id, "ACCEPT")} disabled={isResponding}>
                수락
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRespond(p.id, "BLOCK")} disabled={isResponding}>
                차단
              </Button>
            </div>
          </div>
        ))}
        {pending.length === 0 && <div className="text-sm text-gray-500">대기 중인 요청이 없습니다.</div>}
      </div>
    </div>
  );
};
