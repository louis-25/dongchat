import type { RoomEvent, RoomSummary } from "../types/domain.ts";

// 채팅 목록 요약 캐시를 실시간 이벤트로 갱신하는 순수 함수. 서버가 기준이고, 확신할 수 없으면 refetch.
const activity = (r: RoomSummary) => new Date(r.lastMessage?.at ?? r.createdAt).getTime();

export const sortSummaries = (list: RoomSummary[]): RoomSummary[] =>
  [...list].sort((a, b) => activity(b) - activity(a) || b.id - a.id);

export const totalUnread = (list: RoomSummary[]): number => list.reduce((n, r) => n + r.unreadCount, 0);

const replace = (list: RoomSummary[], i: number, next: RoomSummary) => list.map((r, j) => (j === i ? next : r));

export const applyRoomEvent = (
  list: RoomSummary[],
  e: RoomEvent,
  ctx: { me: string; isViewing: (roomId: number) => boolean },
): { list: RoomSummary[]; refetch: boolean } => {
  const i = list.findIndex((r) => r.id === e.roomId);
  switch (e.type) {
    case "message": {
      if (i < 0) return { list, refetch: true };
      const r = list[i];
      const m = e.message;
      if (r.lastMessage && r.lastMessage.id >= m.id) return { list, refetch: false }; // 중복·늦게 온 이벤트
      const counts = m.senderId !== ctx.me && !ctx.isViewing(r.id);
      return {
        list: sortSummaries(
          replace(list, i, {
            ...r,
            lastMessage: { id: m.id, content: m.content, deleted: false, senderId: m.senderId, at: m.createdAt },
            unreadCount: r.unreadCount + (counts ? 1 : 0),
          }),
        ),
        refetch: false,
      };
    }
    case "message_edited": {
      const r = list[i];
      if (!r || r.lastMessage?.id !== e.id) return { list, refetch: false };
      return { list: replace(list, i, { ...r, lastMessage: { ...r.lastMessage, content: e.content } }), refetch: false };
    }
    case "read_update": {
      const r = list[i];
      if (!r || e.userId !== ctx.me || r.unreadCount === 0) return { list, refetch: false };
      return { list: replace(list, i, { ...r, unreadCount: 0 }), refetch: false };
    }
    // 삭제(보낸이·읽음 여부를 모름)·멤버 변동·재구독(놓친 이벤트)은 서버에서 다시 받는다.
    case "message_deleted":
    case "member_removed":
    case "subscribed":
      return { list, refetch: true };
    case "profile_updated":
      return { list, refetch: false };
  }
};
