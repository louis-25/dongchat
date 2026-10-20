"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-handler";
import { formatListTime } from "@/lib/format";
import { highlightParts } from "@/lib/search";
import { searchMessages } from "@/services/messages";
import { SEARCH_PAGE_SIZE, type DomainError, type MessageSearchHit } from "@/types/domain";

type Props = { open: boolean; onClose: () => void; roomId: number; onPick: (messageId: number) => void };

// 방 안 대화 검색. 결과를 누르면 그 메시지로 이동(부모가 이전 대화를 불러온다).
export function MessageSearchSheet({ open, onClose, roomId, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(""); // 결과가 어떤 검색어의 것인지(강조·더 보기)
  const [hits, setHits] = useState<MessageSearchHit[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const run = async (q: string, before?: number) => {
    setLoading(true);
    setFailure(null);
    try {
      const page = await searchMessages(roomId, q, before);
      setHits((prev) => (before && prev ? [...prev, ...page] : page));
      setMore(page.length === SEARCH_PAGE_SIZE);
      setSearched(q);
    } catch (e) {
      setFailure(getErrorMessage(e as DomainError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="대화 검색">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) void run(query.trim());
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="검색어" maxLength={50} enterKeyHint="search" aria-label="검색어" />
        <Button type="submit" loading={loading && !hits?.length} disabled={!query.trim()} aria-label="검색">
          <Search className="size-4" />
        </Button>
      </form>
      {failure && <p className="mt-3 text-sm text-destructive">{failure}</p>}
      {hits && hits.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">찾는 대화가 없어요</p>}
      {hits && hits.length > 0 && (
        <ul className="-mx-4 mt-3 max-h-[55dvh] divide-y overflow-y-auto">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="pressable-row w-full px-4 py-2.5 text-left"
                onClick={() => {
                  onClose();
                  onPick(h.id);
                }}
              >
                <span className="flex justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{h.senderName}</span>
                  <span className="shrink-0">{formatListTime(h.createdAt)}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 break-words text-sm">
                  {highlightParts(h.content, searched).map((p, i) =>
                    p.hit ? (
                      <mark key={i} className="rounded-sm bg-primary/20 text-foreground">
                        {p.text}
                      </mark>
                    ) : (
                      <span key={i}>{p.text}</span>
                    ),
                  )}
                </span>
              </button>
            </li>
          ))}
          {more && (
            <li className="p-2">
              <Button variant="ghost" className="w-full" loading={loading} onClick={() => void run(searched, hits[hits.length - 1].id)}>
                더 보기
              </Button>
            </li>
          )}
        </ul>
      )}
    </Sheet>
  );
}
