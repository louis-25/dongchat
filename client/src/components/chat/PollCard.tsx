"use client";

import { useEffect, useState } from "react";
import { BarChart3, Check } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePoll } from "@/hooks/usePoll";
import { POLL_LABEL_MAX, POLL_OPTIONS_MAX, isClosed, nextChoice, pollMeta } from "@/lib/polls";
import { cn } from "@/lib/utils";

type Props = { roomId: number; pollId: number; me: string };

// 대화 속 투표 카드. 줄을 누르면 바로 투표(한 개 선택은 옮기기, 같은 줄은 취소).
export function PollCard({ roomId, pollId, me }: Props) {
  const { poll, isError, vote, addOption, adding, close, closing } = usePoll(roomId, pollId);
  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState<string | null>(null); // 항목 추가 입력(null = 닫힘)
  const [votersOf, setVotersOf] = useState<number | null>(null);
  const closesAt = poll?.closesAt ?? null;

  // 마감 시각에 다시 그려 "마감됨"으로(setTimeout 최대치를 넘으면 중간에 한 번 깨어 다시 건다)
  useEffect(() => {
    if (!closesAt) return;
    const ms = new Date(closesAt).getTime() - now.getTime();
    if (ms <= 0) return;
    const t = setTimeout(() => setNow(new Date()), Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [closesAt, now]);

  if (!poll) {
    return (
      <div className="w-64 max-w-[70vw] rounded-[14px] bg-muted p-4 text-sm text-muted-foreground">
        {isError ? "투표를 불러오지 못했어요" : "투표 불러오는 중…"}
      </div>
    );
  }

  const closed = isClosed(poll, now);
  const meta = pollMeta(poll, now);
  const total = Math.max(1, poll.voterCount);
  const shown = poll.options.find((o) => o.id === votersOf);
  const canAdd = !closed && draft === null && (poll.allowAdd || poll.creatorId === me) && poll.options.length < POLL_OPTIONS_MAX;

  return (
    <div className="w-64 max-w-[70vw] whitespace-normal rounded-[14px] border bg-background p-3 text-foreground">
      <div className="flex items-start gap-1.5 font-semibold">
        <BarChart3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 break-words">{poll.question}</span>
      </div>
      {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
      <ul className="mt-2 flex flex-col gap-1.5">
        {poll.options.map((o) => {
          const mine = poll.myOptionIds.includes(o.id);
          return (
            <li key={o.id} className="flex items-stretch gap-1">
              <button
                type="button"
                disabled={closed}
                aria-pressed={mine}
                onClick={() => vote(nextChoice(poll.myOptionIds, o.id, poll.multiple))}
                className={cn(
                  "pressable relative flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-lg border px-2.5 py-2 text-left text-sm",
                  mine ? "border-primary" : "border-border",
                )}
              >
                <span aria-hidden className={cn("absolute inset-y-0 left-0", mine ? "bg-primary/20" : "bg-muted")} style={{ width: `${(o.count / total) * 100}%` }} />
                <span className="relative flex size-4 shrink-0 items-center justify-center">{mine && <Check className="size-4 text-primary" />}</span>
                <span className="relative min-w-0 flex-1 break-words">{o.label}</span>
              </button>
              <button
                type="button"
                disabled={poll.anonymous || o.count === 0}
                onClick={() => setVotersOf(o.id)}
                aria-label={poll.anonymous ? `${o.label} ${o.count}표` : `${o.label} ${o.count}표, 고른 사람 보기`}
                className="pressable w-8 shrink-0 text-sm tabular-nums text-muted-foreground"
              >
                {o.count}
              </button>
            </li>
          );
        })}
      </ul>
      {draft !== null && (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const label = draft.trim();
            if (label) addOption(label).then(() => setDraft(null), () => {}); // 실패 토스트는 usePoll
          }}
        >
          <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={POLL_LABEL_MAX} placeholder="새 항목" aria-label="새 항목" className="h-9" />
          <Button type="submit" size="sm" className="h-9" loading={adding} disabled={!draft.trim()}>
            추가
          </Button>
        </form>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{poll.voterCount}명 참여</span>
        <span className="flex gap-3">
          {canAdd && (
            <button type="button" className="pressable" onClick={() => setDraft("")}>
              + 항목 추가
            </button>
          )}
          {!closed && poll.creatorId === me && (
            <button type="button" className="pressable text-destructive" disabled={closing} onClick={() => confirm("투표를 마감할까요?") && close()}>
              투표 마감
            </button>
          )}
        </span>
      </div>
      <Sheet open={shown !== undefined} onClose={() => setVotersOf(null)} title={shown ? `${shown.label} · ${shown.count}명` : undefined}>
        <ul className="flex flex-col gap-2 text-sm">
          {shown?.voters.map((name, i) => <li key={i}>{name}</li>)}
        </ul>
      </Sheet>
    </div>
  );
}
