"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAllRooms } from "@/services/admin";
import { ADMIN_ROOMS_QUERY_KEY, RoomDetail } from "./RoomDetail";

const LIMIT = 20;

export default function AdminRoomsPage() {
  const [page, setPage] = useState(1);
  const [pickedId, setPickedId] = useState<number | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: [...ADMIN_ROOMS_QUERY_KEY, page],
    queryFn: () => listAllRooms({ page, limit: LIMIT }),
    placeholderData: keepPreviousData,
  });
  const rooms = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT));
  // 선택한 방이 삭제돼 목록에서 사라지면 선택 해제(Review Focus 5)
  const selected = rooms.find((r) => r.id === pickedId) ?? null;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle>
            전체 채팅방
            <span className="ml-2 text-sm font-normal text-gray-500">
              {data ? `${data.total}개` : ""} {isFetching ? "불러오는 중..." : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setPickedId(room.id)}
                className={`w-full rounded border px-2 py-2 text-left ${
                  selected?.id === room.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
                }`}
              >
                <div className="font-semibold">
                  {room.name ?? `${room.isGroup ? "그룹방" : "1:1 방"} #${room.id}`}
                  {room.isGroup && <span className="ml-1 text-xs font-normal text-gray-500">그룹</span>}
                </div>
                <div className="text-xs text-gray-600">
                  방장 {room.ownerUsername ?? "-"} · 멤버 {room.memberCount}명
                </div>
              </button>
            ))}
            {rooms.length === 0 && <div className="text-sm text-gray-500">채팅방이 없습니다.</div>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              이전
            </Button>
            <span className="text-sm text-gray-700">
              {page} / {totalPages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              다음
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="md:col-span-2 h-[80vh] flex flex-col overflow-hidden">
        {selected ? (
          <RoomDetail key={selected.id} room={selected} />
        ) : (
          <div className="p-6 text-sm text-gray-500">왼쪽에서 채팅방을 선택하세요.</div>
        )}
      </Card>
    </div>
  );
}
