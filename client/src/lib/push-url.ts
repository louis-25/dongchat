// 푸시 알림 클릭 URL(/chat/rooms?room=<id>)에서 열 방 id를 읽는다. 잘못된 값은 무시(null).
export const roomIdFromSearch = (search: string): number | null => {
  const id = Number(new URLSearchParams(search).get("room"));
  return Number.isInteger(id) && id > 0 ? id : null;
};
