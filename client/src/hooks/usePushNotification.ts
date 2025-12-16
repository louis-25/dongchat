"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { BASE_URL } from "@/config";
import { getAccessToken } from "@/lib/api-client";

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * VAPID 공개 키를 Uint8Array로 변환
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * 푸시 알림 구독 훅
 */
export function usePushNotification() {
  const { data: session } = useSession();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 브라우저 지원 여부 확인
    setIsSupported("serviceWorker" in navigator && "PushManager" in window);
  }, []);

  /**
   * 현재 구독 상태 확인
   */
  const checkSubscription = useCallback(async () => {
    if (!isSupported || !session) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("[Push] Failed to check subscription:", error);
      setIsSubscribed(false);
    }
  }, [isSupported, session]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  /**
   * 푸시 알림 구독
   */
  const subscribe = useCallback(async () => {
    if (!isSupported || !session || isLoading) return false;

    setIsLoading(true);

    try {
      // Service Worker 등록
      const registration = await navigator.serviceWorker.register(
        "/service-worker.js"
      );
      await navigator.serviceWorker.ready;

      // VAPID 공개 키 가져오기 (환경 변수에서)
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error("VAPID_PUBLIC_KEY is not configured");
      }

      // 푸시 구독
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey
        ) as ArrayBufferView<ArrayBuffer>,
      });

      // 구독 정보를 서버에 전송
      const subscriptionData: PushSubscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(
            String.fromCharCode(
              ...new Uint8Array(subscription.getKey("p256dh")!)
            )
          )
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, ""),
          auth: btoa(
            String.fromCharCode(...new Uint8Array(subscription.getKey("auth")!))
          )
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, ""),
        },
      };

      const token = getAccessToken();
      const response = await fetch(`${BASE_URL}/push/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(subscriptionData),
      });

      if (!response.ok) {
        throw new Error("Failed to subscribe on server");
      }

      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error("[Push] Subscription failed:", error);
      setIsSubscribed(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, session, isLoading]);

  /**
   * 푸시 알림 구독 해제
   */
  const unsubscribe = useCallback(async () => {
    if (!isSupported || isLoading) return false;

    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        // 서버에서도 구독 해제
        const token = getAccessToken();
        await fetch(`${BASE_URL}/push/unsubscribe`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        setIsSubscribed(false);
        return true;
      }
    } catch (error) {
      console.error("[Push] Unsubscription failed:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isLoading]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    checkSubscription,
  };
}
