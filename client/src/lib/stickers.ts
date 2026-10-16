// 이모티콘 목록. 그림은 public/stickers/<id>.svg — 파일만 바꾸면 그림이 바뀐다.
// id는 DB check(^[a-z0-9_]{1,32}$)를 따른다. 목록에서 빼도 이미 보낸 메시지는 그림 파일이 있으면 계속 보인다.
export const STICKERS = [
  { id: "hi", label: "안녕" },
  { id: "love", label: "사랑해" },
  { id: "lol", label: "ㅋㅋㅋ" },
  { id: "cry", label: "엉엉" },
  { id: "wow", label: "헉" },
  { id: "angry", label: "부글부글" },
  { id: "ok", label: "좋아" },
  { id: "sleep", label: "잘 자" },
] as const;

export const STICKER_FALLBACK = "(이모티콘)";

export const stickerSrc = (id: string) => `/stickers/${id}.svg`;
export const stickerLabel = (id: string) => STICKERS.find((s) => s.id === id)?.label ?? "이모티콘";
