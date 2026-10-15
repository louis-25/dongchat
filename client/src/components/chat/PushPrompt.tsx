"use client";

import { useSyncExternalStore } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePushNotification } from "@/hooks/usePushNotification";
import { PROMPT_SNOOZE_MS, PUSH_OPT_OUT_KEY, PUSH_PROMPT_DISMISSED_KEY, promptMode } from "@/lib/push-prompt";

const EVENT = "dongchat:push-prompt";
// 브라우저 전용 값 한 줄: iOS 사파리(홈 화면 앱 아님)|직접 끔|최근에 닫음(일주일). 시간 비교는 렌더 밖(여기)에서.
const snapshot = (): string => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  let optOut = "0";
  let snoozed = "0";
  try {
    optOut = localStorage.getItem(PUSH_OPT_OUT_KEY) === "1" ? "1" : "0";
    const at = Number(localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) ?? 0);
    snoozed = at > 0 && Date.now() - at < PROMPT_SNOOZE_MS ? "1" : "0";
  } catch {
    // 저장소 접근 불가
  }
  return `${ios && !standalone ? 1 : 0}|${optOut}|${snoozed}`;
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};

// 채팅 목록의 "알림 받을까요? [켜기]" 안내. 허락 창은 [켜기]를 누른 순간에만 뜬다(브라우저 규칙).
export function PushPrompt() {
  const push = usePushNotification();
  const env = useSyncExternalStore(subscribe, snapshot, () => "server");
  if (env === "server" || !push.checked) return null;
  const [iosBrowser, optOut, snoozed] = env.split("|");
  const mode = promptMode({
    supported: push.isSupported,
    permission: push.permission,
    subscribed: push.isSubscribed,
    optedOut: optOut === "1",
    iosBrowser: iosBrowser === "1",
    dismissedAt: snoozed === "1" ? 0 : null, // 일주일 판단은 snapshot에서 끝냈다
    now: 0,
  });
  if (!mode) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, String(Date.now()));
    } catch {
      // 저장 불가면 이번 방문에만 숨김
    }
    window.dispatchEvent(new Event(EVENT));
  };
  const turnOn = async () => {
    const result = await push.subscribe();
    if (result === "granted") toast.success("알림을 켰어요. 새 메시지가 오면 알려 드릴게요.");
    else if (result === "denied") toast.error("알림이 차단됐어요. 브라우저 설정에서 허용해 주세요.");
    else if (result === "failed") toast.error("알림을 켜지 못했어요. 설정에서 다시 시도해 주세요.");
  };

  return (
    <div className="mx-3 mb-3 flex items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-sm" role="region" aria-label="알림 안내">
      <Bell className="size-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1">
        {mode === "ask"
          ? "새 메시지가 오면 알려 드릴까요?"
          : "알림이 차단돼 있어요. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요."}
      </p>
      {mode === "ask" && (
        <Button size="sm" loading={push.isLoading} onClick={() => void turnOn()}>
          켜기
        </Button>
      )}
      <button type="button" onClick={dismiss} aria-label="알림 안내 닫기" className="pressable rounded-full p-1 text-muted-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}
