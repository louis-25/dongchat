"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import useAuth from "@/hooks/useAuth";
import { registerPushSubscription, removePushSubscription } from "@/services/push";

// VAPID 공개키(base64url) → Uint8Array
const urlBase64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isPushSupported = () => "serviceWorker" in navigator && "PushManager" in window;
const noSubscribe = () => () => {};

/** 웹 푸시 구독 훅. 구독 정보는 Supabase(services/push)에 저장하고, 발송은 서버가 한다. */
export function usePushNotification() {
  const { user } = useAuth();
  // 서버 렌더·hydration 때는 false, 브라우저에서만 실제 값(불일치 없음, effect 안 setState 없음)
  const isSupported = useSyncExternalStore(noSubscribe, isPushSupported, () => false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const checkSubscription = useCallback(async () => {
    if (!isSupported || !user) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    // 브라우저에 구독이 남아 있으면 지금 사용자로 다시 등록한다(강제 로그아웃·정지로 서버 행이 지워졌거나 다른 사용자 소유였던 경우 복구).
    if (subscription) await registerPushSubscription(subscription).catch(() => undefined);
    setIsSubscribed(!!subscription);
  }, [isSupported, user]);

  useEffect(() => {
    void checkSubscription();
  }, [checkSubscription]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !user || isLoading) return false;
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.error("[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY가 설정되지 않았습니다.");
      return false;
    }
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      await registerPushSubscription(subscription);
      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error("[Push] 구독 실패:", error);
      setIsSubscribed(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user, isLoading]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || isLoading) return false;
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      return true;
    } catch (error) {
      console.error("[Push] 구독 해제 실패:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isLoading]);

  return { isSupported, isSubscribed, isLoading, subscribe, unsubscribe, checkSubscription };
}
