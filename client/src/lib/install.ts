export const INSTALL_DISMISS_KEY = "dongchat.installDismissed";

// 홈 화면 설치 안내 종류. iOS 사파리는 설치 이벤트가 없어 "공유 → 홈 화면에 추가" 문구.
export const installMode = (s: { standalone: boolean; ios: boolean; dismissed: boolean; canPrompt: boolean }): "prompt" | "ios" | null => {
  if (s.standalone || s.dismissed) return null;
  if (s.canPrompt) return "prompt";
  if (s.ios) return "ios";
  return null;
};
