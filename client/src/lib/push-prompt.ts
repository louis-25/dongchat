// 알림 켜기 안내·자동 등록 판단(순수 함수). 브라우저는 사용자 동작 없이 허락 창을 띄울 수 없으므로
// 처음엔 안내 배너의 [켜기]로 묻고, 한 번 허용한 브라우저는 로그인할 때마다 자동으로 다시 등록한다.
export const PUSH_OPT_OUT_KEY = "dongchat.pushOptOut"; // 설정에서 직접 끈 기기(자동 등록·안내 안 함)
export const PUSH_PROMPT_DISMISSED_KEY = "dongchat.pushPromptDismissedAt";
export const PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type Base = { supported: boolean; permission: NotificationPermission; subscribed: boolean; optedOut: boolean };

export const shouldAutoSubscribe = (s: Base): boolean =>
  s.supported && s.permission === "granted" && !s.subscribed && !s.optedOut;

export const promptMode = (
  s: Base & { iosBrowser: boolean; dismissedAt: number | null; now: number },
): "ask" | "denied" | null => {
  if (!s.supported || s.subscribed || s.optedOut || s.iosBrowser) return null; // iOS 브라우저는 설치 안내(InstallBanner)가 먼저
  if (s.dismissedAt !== null && s.now - s.dismissedAt < PROMPT_SNOOZE_MS) return null;
  if (s.permission === "denied") return "denied";
  if (s.permission === "default") return "ask";
  return null; // granted + 미구독은 자동 등록이 처리
};
