"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-handler";
import { POLL_LABEL_MAX, POLL_OPTIONS_MAX, POLL_QUESTION_MAX, cleanOptions, normalizeLabel, toLocalInput } from "@/lib/polls";
import { createPoll } from "@/services/polls";
import type { DomainError } from "@/types/domain";

type Props = { open: boolean; onClose: () => void; roomId: number };

const DAY_MS = 24 * 60 * 60 * 1000;

// 투표 만들기. 만든 투표는 메시지로 오므로(Realtime) 따로 목록을 고치지 않는다.
export function CreatePollSheet({ open, onClose, roomId }: Props) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [allowAdd, setAllowAdd] = useState(false);
  const [closesAt, setClosesAt] = useState<string | null>(null); // datetime-local 값, null = 마감 시각 없음
  const [pending, setPending] = useState(false);
  const ready = normalizeLabel(question) !== "" && cleanOptions(options).length >= 2;

  const submit = async () => {
    setPending(true);
    try {
      await createPoll(roomId, {
        question: normalizeLabel(question),
        options: cleanOptions(options),
        multiple,
        anonymous,
        allowAdd,
        closesAt: closesAt ? new Date(closesAt).toISOString() : null,
      });
      setQuestion("");
      setOptions(["", ""]);
      setMultiple(false);
      setAnonymous(false);
      setAllowAdd(false);
      setClosesAt(null);
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e as unknown as DomainError));
    } finally {
      setPending(false);
    }
  };

  const toggles = [
    ["여러 개 선택", multiple, setMultiple],
    ["익명 투표", anonymous, setAnonymous],
    ["참여자도 항목 추가", allowAdd, setAllowAdd],
  ] as const;

  return (
    <Sheet open={open} onClose={onClose} title="투표 만들기">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !pending) void submit();
        }}
      >
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="투표 제목" maxLength={POLL_QUESTION_MAX} aria-label="투표 제목" />
        <ul className="flex max-h-[35dvh] flex-col gap-2 overflow-y-auto">
          {options.map((o, i) => (
            <li key={i} className="flex items-center gap-1">
              <Input
                value={o}
                onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`항목 ${i + 1}`}
                maxLength={POLL_LABEL_MAX}
                aria-label={`항목 ${i + 1}`}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`항목 ${i + 1} 지우기`}
                  className="pressable shrink-0 rounded-full p-2 text-muted-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {options.length < POLL_OPTIONS_MAX && (
          <Button type="button" variant="ghost" className="pressable self-start" onClick={() => setOptions((prev) => [...prev, ""])}>
            <Plus className="size-4" />
            항목 추가
          </Button>
        )}
        {toggles.map(([label, value, set]) => (
          <label key={label} className="flex items-center justify-between text-sm">
            <span>{label}</span>
            <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} className="size-5 accent-primary" />
          </label>
        ))}
        <label className="flex items-center justify-between text-sm">
          <span>마감 시각</span>
          <input
            type="checkbox"
            checked={closesAt !== null}
            onChange={(e) => setClosesAt(e.target.checked ? toLocalInput(new Date(Date.now() + DAY_MS)) : null)}
            className="size-5 accent-primary"
          />
        </label>
        {closesAt !== null && (
          <Input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value || null)} aria-label="마감 시각" />
        )}
        <Button type="submit" className="h-12 text-base" disabled={!ready} loading={pending}>
          만들기
        </Button>
      </form>
    </Sheet>
  );
}
