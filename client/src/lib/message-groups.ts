import { formatDateDivider } from "./format.ts";
import type { MessageView } from "./chat-state.ts";

export const GROUP_GAP_MS = 5 * 60_000;

export type TimelineItem =
  | { kind: "date"; key: string; label: string }
  | { kind: "notice"; key: string; text: string } // 입장·퇴장 안내
  | { kind: "message"; key: string; view: MessageView; first: boolean; last: boolean };

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

// 같은 보낸이·같은 날·5분 이내·둘 다 삭제 안 됨이면 이어진 묶음. first = 이름/아바타, last = 시간/안 읽은 수.
const joins = (a: MessageView, b: MessageView) =>
  a.kind === "user" &&
  b.kind === "user" &&
  a.senderId === b.senderId &&
  a.deletedAt === null &&
  b.deletedAt === null &&
  sameDay(a.createdAt, b.createdAt) &&
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() <= GROUP_GAP_MS;

export const buildTimeline = (views: MessageView[]): TimelineItem[] => {
  const items: TimelineItem[] = [];
  views.forEach((view, i) => {
    const prev = views[i - 1];
    const next = views[i + 1];
    if (!prev || !sameDay(prev.createdAt, view.createdAt)) {
      items.push({ kind: "date", key: `d-${view.id}`, label: formatDateDivider(view.createdAt) });
    }
    if (view.kind === "system") {
      items.push({ kind: "notice", key: `m-${view.id}`, text: view.content });
      return;
    }
    items.push({
      kind: "message",
      key: `m-${view.id}`,
      view,
      first: !prev || !joins(prev, view),
      last: !next || !joins(view, next),
    });
  });
  return items;
};
