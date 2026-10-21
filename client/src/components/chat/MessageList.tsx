"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { scrollAction, type MessageView } from "@/lib/chat-state";
import { buildTimeline } from "@/lib/message-groups";

type Props = {
  messages: MessageView[];
  readOnly?: boolean;
  onOpenActions?: (view: MessageView) => void;
  onOpenProfile?: (userId: string) => void;
  me?: string;
  onReact?: (messageId: number, reaction: string | null) => void;
  onLoadOlder: () => void;
  hasMore: boolean;
  loadingOlder: boolean;
};

const NEAR_BOTTOM_PX = 80;
const LOAD_OLDER_PX = 40;
const noop = () => {};

// 방이 바뀌면 부모가 key로 다시 마운트한다(스크롤 기준 초기화).
export function MessageList({ messages, readOnly = false, onOpenActions = noop, onOpenProfile, me, onReact, onLoadOlder, hasMore, loadingOlder }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const last = useRef({ firstId: null as number | null, lastId: null as number | null, height: 0, nearBottom: true });
  const [atBottom, setAtBottom] = useState(true);
  const [seenId, setSeenId] = useState<number | null>(null);
  const timeline = useMemo(() => buildTimeline(messages), [messages]);

  const isNearBottom = (el: HTMLDivElement) => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    last.current.nearBottom = near;
    setAtBottom(near);
    if (near) setSeenId(messages[messages.length - 1]?.id ?? null);
    if (el.scrollTop < LOAD_OLDER_PX && hasMore && !loadingOlder) onLoadOlder();
  };

  // 그리기 전에 위치를 맞춰 깜빡임·점프를 없앤다(위를 보고 있으면 끌어내리지 않음).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = { firstId: messages[0]?.id ?? null, lastId: messages[messages.length - 1]?.id ?? null };
    const action = scrollAction(last.current, next, {
      mineAppended: messages[messages.length - 1]?.isMine ?? false,
      nearBottom: last.current.nearBottom,
    });
    if (action === "bottom") el.scrollTop = el.scrollHeight;
    else if (action === "keep-offset") el.scrollTop += el.scrollHeight - last.current.height;
    last.current = { ...next, height: el.scrollHeight, nearBottom: isNearBottom(el) };
  }, [messages]);

  // 투표 카드처럼 불러온 뒤 커지는 내용: 맨 아래를 보고 있었다면 계속 맨 아래에 붙인다
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      if (last.current.nearBottom) el.scrollTop = el.scrollHeight;
      last.current.height = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const unseen = atBottom || seenId === null ? 0 : messages.filter((m) => m.id > seenId && !m.isMine).length;
  const jumpTo = (id: number) => document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto overscroll-contain px-3 py-2">
        <div ref={contentRef}>
        {loadingOlder && <p className="py-2 text-center text-xs text-muted-foreground">불러오는 중…</p>}
        {!hasMore && messages.length > 0 && <p className="py-2 text-center text-xs text-muted-foreground">대화의 시작이에요</p>}
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">첫 메시지를 보내 보세요</p>}
        {timeline.map((item) =>
          item.kind === "date" ? (
            <div key={item.key} className="my-3 flex justify-center">
              <span className="rounded-full bg-muted px-3 py-0.5 text-xs text-muted-foreground">{item.label}</span>
            </div>
          ) : item.kind === "notice" ? (
            <p key={item.key} className="my-2 px-6 text-center text-xs text-muted-foreground">
              {item.text}
            </p>
          ) : (
            <MessageBubble
              key={item.key}
              view={item.view}
              first={item.first}
              last={item.last}
              readOnly={readOnly}
              onOpenActions={onOpenActions}
              onJumpTo={jumpTo}
              onOpenProfile={onOpenProfile}
              me={me}
              onReact={onReact}
            />
          ),
        )}
        </div>
      </div>
      {unseen > 0 && (
        <button
          type="button"
          onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
          className="pressable absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow"
        >
          새 메시지 {unseen}개 <ArrowDown className="size-3.5" />
        </button>
      )}
    </div>
  );
}
