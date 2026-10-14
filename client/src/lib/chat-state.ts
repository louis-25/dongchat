import { MESSAGE_PAGE_SIZE, displayName, type ChatMessage, type Participant, type Profile } from "../types/domain.ts";

// 채팅 화면 상태의 순수 함수. useChatMessages가 Realtime 이벤트·스냅샷을 이 함수들로 반영한다.

export type ReadState = Record<string, number>; // userId → last_read_message_id

export type MessageView = ChatMessage & {
  senderName: string;
  isMine: boolean;
  unreadCount: number | null; // null = 읽음 스냅샷 전(숫자 숨김)
  replyTo: { id: number; senderName: string; content: string; deleted: boolean } | null;
};

const byId = (a: ChatMessage, b: ChatMessage) => a.id - b.id;

// id로 병합(incoming 우선), id 오름차순
export const mergeMessages = (base: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const map = new Map(base.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort(byId);
};

// 재동기화 스냅샷 병합. 최신 페이지가 가득 찼으면 그보다 오래된 기존 메시지는 버린다(사이가 끊겼을 수 있음 →
// 과거는 스크롤로 다시 받는다). 스냅샷 응답 전에 Realtime으로 받은 더 새 메시지는 유지한다.
export const mergeSnapshot = (
  current: ChatMessage[],
  latest: ChatMessage[],
): { messages: ChatMessage[]; replaced: boolean } => {
  if (latest.length === MESSAGE_PAGE_SIZE) {
    const floor = latest[0].id;
    return {
      messages: mergeMessages(
        current.filter((m) => m.id >= floor),
        latest,
      ),
      replaced: current.some((m) => m.id < floor),
    };
  }
  return { messages: mergeMessages(current, latest), replaced: false };
};

export const applyEdited = (list: ChatMessage[], e: { id: number; content: string; editedAt: string }): ChatMessage[] =>
  list.map((m) => (m.id === e.id ? { ...m, content: e.content, editedAt: e.editedAt } : m));

export const applyDeleted = (list: ChatMessage[], e: { id: number }, at: string): ChatMessage[] =>
  list.map((m) => (m.id === e.id ? { ...m, content: "", deletedAt: at } : m));

// 읽음 위치는 단조 증가(늦게 도착한 이전 값 무시)
export const bumpRead = (state: ReadState, userId: string, id: number): ReadState =>
  (state[userId] ?? 0) >= id ? state : { ...state, [userId]: id };

// 스냅샷 반영. 한 번도 안 읽은 참여자(null)는 0으로 본다.
export const seedReadState = (participants: Participant[], prev: ReadState | null): ReadState =>
  participants.reduce((acc, p) => bumpRead(acc, p.user.id, p.lastReadMessageId ?? 0), prev ?? {});

export const toViews = (
  messages: ChatMessage[],
  ctx: {
    me: string;
    participants: Participant[];
    profiles: Record<string, Profile>;
    replyTargets: ChatMessage[];
    readState: ReadState | null;
  },
): MessageView[] => {
  const nameOf = (id: string | null): string => {
    const p = id === null ? undefined : (ctx.participants.find((x) => x.user.id === id)?.user ?? ctx.profiles[id]);
    return p ? displayName(p) : "(알 수 없음)";
  };
  const known = new Map([...ctx.replyTargets, ...messages].map((m) => [m.id, m]));
  const readState = ctx.readState;

  return messages.map((m) => {
    const target = m.replyToId === null ? undefined : known.get(m.replyToId);
    return {
      ...m,
      senderName: nameOf(m.senderId),
      isMine: m.senderId === ctx.me,
      unreadCount:
        readState === null
          ? null
          : ctx.participants.filter((p) => p.user.id !== m.senderId && (readState[p.user.id] ?? 0) < m.id).length,
      replyTo:
        m.replyToId === null
          ? null
          : target
            ? { id: target.id, senderName: nameOf(target.senderId), content: target.content, deleted: target.deletedAt !== null }
            : { id: m.replyToId, senderName: "", content: "이전 메시지", deleted: false },
    };
  });
};

export type ListEdge = { firstId: number | null; lastId: number | null };

// 목록이 바뀐 뒤 스크롤 처리. keep-offset = 위에 붙은 만큼 내려 보던 메시지를 제자리에.
export const scrollAction = (
  prev: ListEdge,
  next: ListEdge,
  opts: { mineAppended: boolean; nearBottom: boolean },
): "bottom" | "keep-offset" | "none" => {
  if (next.lastId === null) return "none";
  if (prev.lastId === null) return "bottom";
  if (next.lastId !== prev.lastId) return opts.mineAppended || opts.nearBottom ? "bottom" : "none";
  if (next.firstId !== prev.firstId) return "keep-offset";
  return "none";
};
