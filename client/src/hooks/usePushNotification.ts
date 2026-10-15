"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import useAuth from "@/hooks/useAuth";
import { PUSH_OPT_OUT_KEY, shouldAutoSubscribe } from "@/lib/push-prompt";
import { registerPushSubscription, removePushSubscription } from "@/services/push";

// VAPID 공개키(base64url) → Uint8Array
const urlBase64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isPushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const noSubscribe = () => () => {};

const optedOut = () => {
  try {
    return localStorage.getItem(PUSH_OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
};
const setOptedOut = (value: boolean) => {
  try {
    if (value) localStorage.setItem(PUSH_OPT_OUT_KEY, "1");
    else localStorage.removeItem(PUSH_OPT_OUT_KEY);
  } catch {
    // 저장 불가면 이번 방문에만
  }
};

/**
 * 웹 푸시 구독 훅. 구독 정보는 Supabase(services/push)에 저장하고, 발송은 서버가 한다.
 * autoRegister: 이 브라우저가 알림을 이미 허용했고 사용자가 직접 끄지 않았다면 버튼 없이 다시 등록한다
 * (로그아웃하면 구독을 지우므로 재로그인 때 필요). 채팅 레이아웃에서 한 번만 켠다.
 */
export function usePushNotification({ autoRegister = false }: { autoRegister?: boolean } = {}) {
  const { user } = useAuth();
  // 서버 렌더·hydration 때는 false, 브라우저에서만 실제 값(불일치 없음, effect 안 setState 없음)
  const isSupported = useSyncExternalStore(noSubscribe, isPushSupported, () => false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [checked, setChecked] = useState(false); // 첫 확인 전에는 안내 배너를 띄우지 않는다(깜빡임 방지)
  const busy = useRef(false); // 자동 등록과 버튼이 겹쳐도 한 번만

  const doSubscribe = useCallback(async () => {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.error("[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY가 설정되지 않았습니다.");
      return false;
    }
    const registration = await navigator.serviceWorker.register("/service-worker.js");
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    await registerPushSubscription(subscription);
    setOptedOut(false);
    setIsSubscribed(true);
    return true;
  }, []);

  const checkSubscription = useCallback(async () => {
    if (!isSupported || !user) return;
    setPermission(Notification.permission);
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    // 브라우저에 구독이 남아 있으면 지금 사용자로 다시 등록한다(강제 로그아웃·정지로 서버 행이 지워졌거나 다른 사용자 소유였던 경우 복구).
    if (subscription) await registerPushSubscription(subscription).catch(() => undefined);
    setIsSubscribed(!!subscription);
    setChecked(true);
    const auto = shouldAutoSubscribe({
      supported: true,
      permission: Notification.permission,
      subscribed: !!subscription,
      optedOut: optedOut(),
    });
    if (autoRegister && auto && !busy.current) {
      busy.current = true;
      await doSubscribe()
        .catch((error) => console.error("[Push] 자동 등록 실패:", error))
        .finally(() => (busy.current = false));
    }
  }, [isSupported, user, autoRegister, doSubscribe]);

  useEffect(() => {
    void checkSubscription();
  }, [checkSubscription]);

  // 허락 창(사용자 동작 안에서만 호출) → 허용이면 구독. 결과 권한을 돌려준다.
  const subscribe = useCallback(async (): Promise<NotificationPermission | "failed"> => {
    if (!isSupported || !user || busy.current) return "failed";
    busy.current = true;
    setIsLoading(true);
    try {
      const result = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return result;
      return (await doSubscribe()) ? "granted" : "failed";
    } catch (error) {
      console.error("[Push] 구독 실패:", error);
      setIsSubscribed(false);
      return "failed";
    } finally {
      busy.current = false;
      setIsLoading(false);
    }
  }, [isSupported, user, doSubscribe]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || busy.current) return false;
    busy.current = true;
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setOptedOut(true); // 직접 끈 기기는 자동으로 다시 켜지 않는다
      setIsSubscribed(false);
      return true;
    } catch (error) {
      console.error("[Push] 구독 해제 실패:", error);
      return false;
    } finally {
      busy.current = false;
      setIsLoading(false);
    }
  }, [isSupported]);

  return { isSupported, isSubscribed, isLoading, permission, checked, subscribe, unsubscribe, checkSubscription };
}
