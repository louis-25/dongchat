"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import useToast from "@/hooks/useToast";
import { getErrorMessage } from "@/lib/error-handler";
import { createWebhook, deleteWebhook, listWebhooks, rotateWebhook, webhookUrl } from "@/services/admin";
import type { DomainError } from "@/types/domain";

const QUERY_KEY = ["admin", "webhooks"] as const;

// 수신 웹훅 관리. 토큰은 만들기·재발급 직후 시트에서 한 번만 보인다(DB에는 해시만).
export default function AdminWebhooksPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: listWebhooks });
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [token, setToken] = useState<string | null>(null);

  const done = (t: string) => {
    setToken(t);
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };
  const fail = (e: unknown) => toast.error(getErrorMessage(e as DomainError));
  const create = useMutation({
    mutationFn: () => createWebhook(name, Number(roomId)),
    onSuccess: (t) => {
      setName("");
      done(t);
    },
    onError: fail,
  });
  const rotate = useMutation({ mutationFn: rotateWebhook, onSuccess: done, onError: fail });
  const remove = useMutation({
    mutationFn: deleteWebhook,
    onSuccess: () => {
      toast.success("웹훅을 삭제했습니다.");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: fail,
  });

  const rooms = data?.rooms ?? [];
  const webhooks = data?.webhooks ?? [];
  const curl = token
    ? `curl -X POST "${webhookUrl()}" \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: text/plain; charset=utf-8" \\\n  --data-binary @jobs.txt`
    : "";
  const copy = (text: string) =>
    void navigator.clipboard.writeText(text).then(
      () => toast.success("복사했습니다."),
      () => toast.error("복사하지 못했습니다."),
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>웹훅 만들기</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="봇 이름 (예: 채용봇)" maxLength={20} className="w-48" />
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              aria-label="받을 방"
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">받을 그룹 방 선택</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name ?? `그룹방 #${r.id}`} ({r.memberCount}명)
                </option>
              ))}
            </select>
            <Button type="submit" loading={create.isPending} disabled={!name.trim() || !roomId}>
              만들기
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">봇이 방 멤버로 들어가고 이름으로 글을 올립니다. 1:1 방은 고를 수 없습니다.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>웹훅 {webhooks.length}개</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {webhooks.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center gap-2 rounded border px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{w.name}</div>
                <div className="text-xs text-muted-foreground">
                  {w.roomName ?? `방 #${w.roomId}`} · 마지막 사용 {w.lastUsedAt ? new Date(w.lastUsedAt).toLocaleString() : "없음"}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={rotate.isPending}
                onClick={() => confirm(`'${w.name}' 토큰을 새로 발급할까요? 기존 토큰은 바로 쓸 수 없게 됩니다.`) && rotate.mutate(w.id)}
              >
                토큰 재발급
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={remove.isPending}
                onClick={() => confirm(`'${w.name}' 웹훅을 삭제할까요? 봇이 방에서 나갑니다.`) && remove.mutate(w.id)}
              >
                삭제
              </Button>
            </div>
          ))}
          {webhooks.length === 0 && <div className="text-sm text-muted-foreground">웹훅이 없습니다.</div>}
        </CardContent>
      </Card>

      <Sheet open={token !== null} onClose={() => setToken(null)} title="웹훅 토큰">
        <p className="mb-2 text-sm text-destructive">이 토큰은 지금만 보입니다. 닫기 전에 복사해 두세요.</p>
        <code className="block break-all rounded bg-muted p-2 text-xs select-text">{token}</code>
        <Button className="mt-2 w-full" onClick={() => token && copy(token)}>
          토큰 복사
        </Button>
        <p className="mt-4 mb-1 text-sm font-medium">보내는 방법</p>
        <pre className="overflow-x-auto rounded bg-muted p-2 text-xs select-text">{curl}</pre>
        <Button variant="outline" className="mt-2 w-full" onClick={() => copy(curl)}>
          예시 복사
        </Button>
      </Sheet>
    </div>
  );
}
