import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDeleted,
  applyEdited,
  applyReaction,
  bumpRead,
  withoutRemoved,
  withProfile,
  readmit,
  mergeMessages,
  mergeSnapshot,
  scrollAction,
  seedReadState,
  toViews,
} from "./chat-state.ts";
import type { ChatMessage, Participant, Profile } from "../types/domain.ts";

const msg = (id: number, senderId: string | null = "a", extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  roomId: 1,
  senderId,
  content: `m${id}`,
  sticker: null,
  imagePath: null,
  reactions: [],
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: "2026-10-14T00:00:00Z",
  ...extra,
});
const profile = (id: string, username: string, nickname: string | null = null): Profile => ({
  id,
  username,
  nickname,
  avatarUrl: null,
  statusMessage: null,
});
const part = (p: Profile, lastRead: number | null): Participant => ({
  user: p,
  joinedAt: "2026-10-14T00:00:00Z",
  lastReadMessageId: lastRead,
});
const A = profile("a", "alice_dev");
const B = profile("b", "kakao_ab12cd34", "정동현");
const C = profile("c", "carol");

test("병합: id 중복 제거(새 값 우선), 오름차순", () => {
  const merged = mergeMessages([msg(3), msg(1)], [msg(2), msg(3, "a", { content: "new" })]);
  assert.deepEqual(
    merged.map((m) => [m.id, m.content]),
    [
      [1, "m1"],
      [2, "m2"],
      [3, "new"],
    ],
  );
});

test("스냅샷: 가득 찬 최신 페이지면 그보다 오래된 것만 버리고, 그사이 받은 더 새 메시지는 유지 (Review Focus 3)", () => {
  const latest = Array.from({ length: 30 }, (_, i) => msg(100 + i));
  assert.deepEqual(mergeSnapshot([msg(1), msg(2)], latest), { messages: latest, replaced: true });
  const withNewer = mergeSnapshot([msg(1), msg(2), msg(130)], latest);
  assert.equal(withNewer.replaced, true);
  assert.deepEqual(
    withNewer.messages.map((m) => m.id),
    [...latest.map((m) => m.id), 130],
    "스냅샷 응답 전에 Realtime으로 받은 130은 남는다",
  );
  const contiguous = mergeSnapshot(
    Array.from({ length: 21 }, (_, i) => msg(90 + i)),
    latest,
  );
  assert.equal(contiguous.replaced, false, "겹치면 끊긴 게 아니다 — 스크롤로 불러온 과거(90~99)를 버리지 않는다");
  assert.deepEqual(contiguous.messages[0].id, 90);
  assert.equal(contiguous.messages.length, 40);
  const partial = mergeSnapshot([msg(1), msg(2)], [msg(2), msg(3)]);
  assert.equal(partial.replaced, false);
  assert.deepEqual(
    partial.messages.map((m) => m.id),
    [1, 2, 3],
  );
  assert.equal(mergeSnapshot([], latest).replaced, false, "첫 스냅샷은 교체가 아니라 병합");
});

test("수정·삭제 이벤트 반영", () => {
  const edited = applyEdited([msg(1), msg(2)], { id: 2, content: "고침", editedAt: "t1" });
  assert.deepEqual(edited[1], { ...msg(2), content: "고침", editedAt: "t1" });
  const deleted = applyDeleted(edited, { id: 2 }, "t2");
  assert.deepEqual(deleted[1], { ...msg(2), content: "", editedAt: "t1", deletedAt: "t2" });
  assert.equal(deleted[0], edited[0], "다른 메시지는 그대로");
});

test("읽음 위치는 단조 증가, 스냅샷의 null은 0", () => {
  assert.deepEqual(bumpRead({ a: 5 }, "a", 3), { a: 5 });
  assert.deepEqual(bumpRead({ a: 5 }, "a", 7), { a: 7 });
  assert.deepEqual(seedReadState([part(A, 4), part(B, null)], { a: 6 }), { a: 6 });
  assert.deepEqual(seedReadState([part(A, 4), part(B, null)], null), { a: 4 });
});

test("안 읽은 인원 수: 스냅샷 전 null, 발신자 제외, 한 번도 안 읽은 사람 포함 (Review Focus 1)", () => {
  const participants = [part(A, null), part(B, null), part(C, null)];
  const base = { me: "a", participants, profiles: {}, replyTargets: [] };
  assert.equal(toViews([msg(10)], { ...base, readState: null })[0].unreadCount, null);
  assert.equal(toViews([msg(10)], { ...base, readState: {} })[0].unreadCount, 2, "b, c 둘 다 안 읽음");
  assert.equal(toViews([msg(10)], { ...base, readState: { b: 10 } })[0].unreadCount, 1);
  assert.equal(toViews([msg(10)], { ...base, readState: { b: 10, c: 12 } })[0].unreadCount, 0);
});

test("뷰: 표시명·내 메시지·답장 미리보기(삭제·미로드 포함)", () => {
  const views = toViews(
    [
      msg(5, "b"),
      msg(6, "a", { replyToId: 5 }),
      msg(7, "x", { replyToId: 2 }),
      msg(8, null, { replyToId: 99 }),
    ],
    {
      me: "a",
      participants: [part(A, null), part(B, null)],
      profiles: { x: { ...profile("x", "left_user"), avatarUrl: "https://img/x.png" } },
      replyTargets: [msg(2, "b", { content: "", deletedAt: "t" })],
      readState: {},
    },
  );
  assert.equal(views[0].senderName, "정동현");
  assert.equal(views[0].isMine, false);
  assert.equal(views[1].isMine, true);
  assert.deepEqual(views[1].replyTo, { id: 5, senderName: "정동현", content: "m5", deleted: false });
  assert.equal(views[2].senderName, "left_user", "방을 나간 발신자는 조회한 프로필로");
  assert.equal(views[2].senderAvatar, "https://img/x.png");
  assert.equal(views[3].senderAvatar, null, "모르는 발신자는 사진 없음");
  assert.deepEqual(views[2].replyTo, { id: 2, senderName: "정동현", content: "", deleted: true });
  assert.equal(views[3].senderName, "(알 수 없음)");
  assert.deepEqual(views[3].replyTo, { id: 99, senderName: "", content: "이전 메시지", deleted: false });
});

test("프로필 변경: 해당 참여자만 바꾸고, 없으면 같은 배열", () => {
  const list = [part(A, null), part(B, 3)];
  const next = withProfile(list, { ...B, avatarUrl: "https://img/b2.png" });
  assert.equal(next[1].user.avatarUrl, "https://img/b2.png");
  assert.equal(next[1].lastReadMessageId, 3);
  assert.equal(next[0], list[0]);
  assert.equal(withProfile(list, profile("z", "zed")), list);
});

test("반응 이벤트: 해당 메시지만 바꾼다", () => {
  const list = [msg(1), msg(2)];
  const next = applyReaction(list, { messageId: 2, userId: "b", reaction: "heart" });
  assert.deepEqual(next[1].reactions, [{ userId: "b", reaction: "heart" }]);
  assert.equal(next[0], list[0]);
});

test("다시 초대: 제외 목록에서 빠져 스냅샷 참여자로 돌아온다", () => {
  const removed = readmit(["b", "c"], "b");
  assert.deepEqual(removed, ["c"]);
  assert.deepEqual(withoutRemoved([part(A, null), part(B, null)], removed).map((p) => p.user.id), ["a", "b"]);
});

test("스크롤: 첫 로드·과거 로드·새 메시지·변화 없음 (Review Focus 2)", () => {
  const none = { firstId: null, lastId: null };
  const opts = { mineAppended: false, nearBottom: false };
  assert.equal(scrollAction(none, { firstId: 1, lastId: 5 }, opts), "bottom", "첫 로드는 맨 아래");
  assert.equal(scrollAction(none, none, opts), "none", "빈 방");
  assert.equal(scrollAction({ firstId: 10, lastId: 20 }, { firstId: 1, lastId: 20 }, opts), "keep-offset", "과거 로드");
  assert.equal(scrollAction({ firstId: 10, lastId: 20 }, { firstId: 10, lastId: 20 }, opts), "none", "빈 과거 페이지·수정·읽음");
  assert.equal(scrollAction({ firstId: 10, lastId: 20 }, { firstId: 10, lastId: 21 }, opts), "none", "위를 읽는 중 남의 메시지");
  assert.equal(
    scrollAction({ firstId: 10, lastId: 20 }, { firstId: 10, lastId: 21 }, { mineAppended: false, nearBottom: true }),
    "bottom",
    "맨 아래 근처면 따라감",
  );
  assert.equal(
    scrollAction({ firstId: 10, lastId: 20 }, { firstId: 10, lastId: 21 }, { mineAppended: true, nearBottom: false }),
    "bottom",
    "내가 보낸 메시지",
  );
});

test("늦게 도착한 스냅샷 참여자도 이미 나간 사람은 다시 넣지 않는다", () => {
  assert.deepEqual(
    withoutRemoved([part(A, null), part(B, 3), part(C, null)], ["b"]).map((p) => p.user.id),
    ["a", "c"],
  );
});
