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
