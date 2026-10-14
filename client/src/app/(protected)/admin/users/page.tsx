"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import useAuth from "@/hooks/useAuth";
import useToast from "@/hooks/useToast";
import { getErrorMessage } from "@/lib/error-handler";
import { banUser, forceLogout, listUsers, unbanUser } from "@/services/admin";
import {
  banUntil,
  displayName,
  isBanned,
  isPermanentBan,
  type AdminUser,
  type BanDuration,
  type SortOrder,
  type UserSort,
} from "@/types/domain";

const ADMIN_USERS_QUERY_KEY = ["admin", "users"] as const;
const PAGE_SIZES = [10, 20, 50, 100];
const BAN_OPTIONS: { value: BanDuration; label: string }[] = [
  { value: "1d", label: "1일" },
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "permanent", label: "영구" },
];

const StatusBadge = ({ user }: { user: AdminUser }) =>
  isBanned(user.bannedUntil) ? (
    <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
      정지 · {isPermanentBan(user.bannedUntil) ? "영구" : `${new Date(user.bannedUntil!).toLocaleString()}까지`}
    </span>
  ) : (
    <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">정상</span>
  );

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState<UserSort>("created_at");
  const [order, setOrder] = useState<SortOrder>("desc");

  const { data, isFetching } = useQuery({
    queryKey: [...ADMIN_USERS_QUERY_KEY, page, limit, sort, order],
    queryFn: () => listUsers({ page, limit, sort, order }),
    placeholderData: keepPreviousData,
  });
  const users = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  const onDone = (message: string) => () => {
    success(message);
    void queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
  };
  const onFail = (label: string) => (e: Error) => error(`${label}: ${getErrorMessage(e)}`);

  const ban = useMutation({
    mutationFn: ({ id, duration }: { id: string; duration: BanDuration }) => banUser(id, banUntil(duration)),
    onSuccess: onDone("정지했습니다."),
    onError: onFail("정지 실패"),
  });
  const unban = useMutation({ mutationFn: unbanUser, onSuccess: onDone("정지를 해제했습니다."), onError: onFail("해제 실패") });
  const logout = useMutation({
    mutationFn: forceLogout,
    onSuccess: onDone("강제 로그아웃했습니다."),
    onError: onFail("강제 로그아웃 실패"),
  });
  const busy = ban.isPending || unban.isPending || logout.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          사용자 관리
          <span className="ml-2 text-sm font-normal text-gray-500">
            {data ? `${data.total}명` : ""} {isFetching ? "불러오는 중..." : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-gray-600">
            정렬
            <select
              className="h-9 rounded border px-2"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as UserSort);
                setPage(1);
              }}
            >
              <option value="created_at">가입일</option>
              <option value="username">아이디</option>
            </select>
            <select
              className="h-9 rounded border px-2"
              value={order}
              onChange={(e) => {
                setOrder(e.target.value as SortOrder);
                setPage(1);
              }}
            >
              <option value="desc">내림차순</option>
              <option value="asc">오름차순</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-gray-600">
            페이지당
            <select
              className="h-9 rounded border px-2"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">사용자</th>
                <th className="px-3 py-2">이메일</th>
                <th className="px-3 py-2">가입일</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2 text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {displayName(u)}
                      {u.isAdmin && <span className="ml-1 text-xs text-blue-600">관리자</span>}
                    </div>
                    <div className="text-xs text-gray-500">@{u.username}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{u.email ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-600">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <StatusBadge user={u} />
                  </td>
                  <td className="px-3 py-2">
                    {u.id === me?.id ? (
                      <div className="text-right text-xs text-gray-400">(나)</div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        {isBanned(u.bannedUntil) ? (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => unban.mutate(u.id)}>
                            해제
                          </Button>
                        ) : (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button size="sm" variant="outline" disabled={busy}>
                                정지
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-44 p-2">
                              <p className="px-1 pb-2 text-xs text-gray-500">정지 기간</p>
                              <div className="grid grid-cols-2 gap-1">
                                {BAN_OPTIONS.map((opt) => (
                                  <Button
                                    key={opt.value}
                                    size="sm"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => {
                                      if (confirm(`${displayName(u)}님을 ${opt.label} 정지할까요?`)) {
                                        ban.mutate({ id: u.id, duration: opt.value });
                                      }
                                    }}
                                  >
                                    {opt.label}
                                  </Button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          disabled={busy}
                          onClick={() => {
                            if (confirm(`${displayName(u)}님의 모든 기기를 로그아웃시킬까요?`)) logout.mutate(u.id);
                          }}
                        >
                          강제 로그아웃
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-center text-gray-500" colSpan={5}>
                    사용자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            이전
          </Button>
          <span className="text-sm text-gray-700">
            {page} / {totalPages}
          </span>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            다음
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
