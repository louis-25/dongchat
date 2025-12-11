"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BASE_URL } from "@/config";
import { getAccessToken } from "@/lib/api-client";

type FriendRequest = {
  id: number;
  requester?: { id: number; username: string };
  receiver?: { id: number; username: string };
  status: string;
};

type FriendEntry = { id: number; friend: { id: number; username: string } };

const FriendsTab = () => {
  const token = useMemo(() => getAccessToken(), []);
  const authHeader = useMemo(
    () =>
      token
        ? ({ Authorization: `Bearer ${token}` } as Record<string, string>)
        : ({} as Record<string, string>),
    [token]
  );

  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [pending, setPending] = useState<FriendRequest[]>([]);
  const [friendInput, setFriendInput] = useState("");

  const loadFriends = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/friends`, { headers: authHeader });
      if (res.ok) {
        const data = await res.json();
        setFriends(data || []);
      }
      const pendingRes = await fetch(`${BASE_URL}/friends/pending`, {
        headers: authHeader,
      });
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPending(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [authHeader]);

  useEffect(() => {
    (async () => {
      await loadFriends();
    })();
  }, [loadFriends]);

  const handleAddFriend = async () => {
    if (!friendInput.trim()) return;
    try {
      const res = await fetch(`${BASE_URL}/friends/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ username: friendInput.trim() }),
      });
      if (res.ok) {
        setFriendInput("");
        loadFriends();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const respondFriend = async (id: number, action: "accept" | "block") => {
    try {
      const res = await fetch(`${BASE_URL}/friends/${id}/${action}`, {
        method: "PATCH",
        headers: { ...authHeader },
      });
      if (res.ok) {
        loadFriends();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>친구 관리</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="추가할 사용자 아이디"
            value={friendInput}
            onChange={(e) => setFriendInput(e.target.value)}
          />
          <Button onClick={handleAddFriend}>친구 추가</Button>
        </div>
        <div>
          <h3 className="font-semibold mb-2">받은 요청</h3>
          <div className="space-y-2">
            {pending.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded border px-3 py-2"
              >
                <span>
                  {p.requester?.username} → {p.receiver?.username}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respondFriend(p.id, "accept")}
                  >
                    수락
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respondFriend(p.id, "block")}
                  >
                    차단
                  </Button>
                </div>
              </div>
            ))}
            {pending.length === 0 && (
              <div className="text-sm text-gray-500">
                대기 중인 요청이 없습니다.
              </div>
            )}
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2">친구 목록</h3>
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
      </CardContent>
    </Card>
  );
};

export default FriendsTab;
