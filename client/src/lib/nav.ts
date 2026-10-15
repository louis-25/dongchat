// 방 화면의 ‹: 앱 안에서 들어왔으면 history.back, 알림·직접 주소로 들어왔으면 목록으로 replace.
const KEY = "dongchat.inAppNav";

const session = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

export const markInAppNav = (store: Storage | null = session()): void => {
  try {
    store?.setItem(KEY, "1");
  } catch {
    // 저장 불가(사파리 개인정보 보호 모드 등)면 ‹가 목록으로 replace한다
  }
};

export const consumeInAppNav = (store: Storage | null = session()): boolean => {
  try {
    const hit = store?.getItem(KEY) === "1";
    store?.removeItem(KEY);
    return hit;
  } catch {
    return false;
  }
};

// 같은 탭에서 이동하는 평범한 왼쪽 클릭만 앱 안 이동으로 본다(새 탭·수정키 클릭은 이 탭에 표시를 남기지 않는다).
export const isPlainClick = (e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;
