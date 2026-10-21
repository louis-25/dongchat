import type { Poll } from "../types/domain.ts";

// 투표 규칙(서버 create_poll·add_poll_option과 같은 값·같은 정리 규칙)
export const POLL_QUESTION_MAX = 100;
export const POLL_LABEL_MAX = 50;
export const POLL_OPTIONS_MAX = 20;

// 연속 공백 → 한 칸, 앞뒤 공백 제거(private.normalize_label)
export const normalizeLabel = (s: string): string => s.replace(/\s+/g, " ").trim();

// 빈 칸 제거, 대소문자 무시 중복 제거(첫 등장 유지)
export const cleanOptions = (list: string[]): string[] => {
  const seen = new Set<string>();
  return list.map(normalizeLabel).filter((label) => {
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// 줄을 눌렀을 때 내 새 선택. 한 개 선택: 같은 줄이면 취소, 아니면 옮기기. 여러 개: 토글.
export const nextChoice = (mine: number[], optionId: number, multiple: boolean): number[] =>
  mine.includes(optionId) ? mine.filter((id) => id !== optionId) : multiple ? [...mine, optionId] : [optionId];

// 응답 전 화면에 먼저 반영(표 수·참여자 수·내 선택). 투표자 이름은 서버 응답으로 갱신된다.
export const withMyVote = (poll: Poll, next: number[]): Poll => {
  const before = new Set(poll.myOptionIds);
  const after = new Set(next);
  return {
    ...poll,
    myOptionIds: next,
    voterCount: poll.voterCount + (after.size > 0 ? 1 : 0) - (before.size > 0 ? 1 : 0),
    options: poll.options.map((o) => ({ ...o, count: o.count + (after.has(o.id) ? 1 : 0) - (before.has(o.id) ? 1 : 0) })),
  };
};

// 최종 판정은 서버. 화면은 마감 시각이 지나면 바로 닫힌 것으로 그린다.
export const isClosed = (poll: Poll, now: Date): boolean =>
  poll.closed || (poll.closesAt !== null && new Date(poll.closesAt).getTime() <= now.getTime());

const pad = (n: number) => String(n).padStart(2, "0");

// 카드 머리 작은 글씨: "익명 · 여러 개 선택 · 10/22 18:05 마감" / 마감되면 마지막이 "마감됨"
export const pollMeta = (poll: Poll, now: Date): string => {
  const at = poll.closesAt ? new Date(poll.closesAt) : null;
  const end = isClosed(poll, now)
    ? "마감됨"
    : at && `${at.getMonth() + 1}/${at.getDate()} ${pad(at.getHours())}:${pad(at.getMinutes())} 마감`;
  return [poll.anonymous && "익명", poll.multiple && "여러 개 선택", end].filter(Boolean).join(" · ");
};

// <input type="datetime-local"> 값(기기 시간대, 시간대 표기 없음). 보낼 때는 new Date(value).toISOString().
export const toLocalInput = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
