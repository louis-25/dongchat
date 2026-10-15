// 입력창 Enter 처리. 한글 IME 조합 중 Enter는 조합 확정용이라 보내지 않는다(반쪽 글자·중복 전송 방지).
export const shouldSend = (e: { key: string; shiftKey: boolean; isComposing: boolean }, coarsePointer: boolean): boolean =>
  e.key === "Enter" && !e.shiftKey && !e.isComposing && !coarsePointer;
