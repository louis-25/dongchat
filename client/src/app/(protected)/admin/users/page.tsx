"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAccessToken } from "@/lib/api-client";
import { BASE_URL, joinUrl } from "@/config";

type UserRow = {
  id: number;
  username: string;
  role: string;
  createdAt?: string;
  updatedAt?: string;
};

export default function AdminUsersPage() {
  const token = useMemo(() => getAccessToken(), []);
  const authHeader = useMemo(
    () =>
      token
        ? ({ Authorization: `Bearer ${token}` } as Record<string, string>)
        : ({} as Record<string, string>),
    [token]
  );

  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState<"ASC" | "DESC">("DESC");

  const fetchUsers = async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
      order,
    });
    try {
      const res = await fetch(joinUrl(BASE_URL, `/users?${params.toString()}`), {
        headers: authHeader,
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      await fetchUsers();
    };
    fetchData();
  }, [page, limit, sort, order]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mx-auto max-w-5xl p-4">
      <Card>
        <CardHeader>
          <CardTitle>사용자 목록 (ADMIN)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">정렬</span>
              <select
                className="h-9 rounded border px-2 text-sm"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="createdAt">생성일</option>
                <option value="username">아이디</option>
                <option value="role">역할</option>
              </select>
              <select
                className="h-9 rounded border px-2 text-sm"
                value={order}
                onChange={(e) => setOrder(e.target.value as "ASC" | "DESC")}
              >
                <option value="DESC">내림차순</option>
                <option value="ASC">오름차순</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">페이지당</span>
              <Input
                type="number"
                className="w-20"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 20)}
              />
            </div>
          </div>

          <div className="border rounded-md overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">아이디</th>
                  <th className="px-3 py-2">역할</th>
                  <th className="px-3 py-2">생성일</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2">{u.id}</td>
                    <td className="px-3 py-2">{u.username}</td>
                    <td className="px-3 py-2">{u.role}</td>
                    <td className="px-3 py-2">
                      {u.createdAt
                        ? new Date(u.createdAt).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td
                      className="px-3 py-3 text-center text-gray-500"
                      colSpan={4}
                    >
                      데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              이전
            </Button>
            <span className="text-sm text-gray-700">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
