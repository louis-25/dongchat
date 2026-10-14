import { createClient } from "@/lib/supabase/client";
import { toDomainError } from "./errors";

// 웹 푸시 구독 경계. 발송은 서버(DB 웹훅 → Edge Function)가 한다.
export async function registerPushSubscription(sub: PushSubscription): Promise<void> {
  const { endpoint, keys } = sub.toJSON(); // keys.p256dh·auth는 base64url
  const { error } = await createClient().rpc("register_push_subscription", {
    p_endpoint: endpoint ?? "",
    p_p256dh: keys?.p256dh ?? "",
    p_auth: keys?.auth ?? "",
  });
  if (error) throw toDomainError(error);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const { error } = await createClient().from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw toDomainError(error);
}

// 로그아웃 시 이 브라우저 구독을 지운다(공용 브라우저에 이전 사용자 메시지가 뜨지 않게). 실패해도 로그아웃은 진행.
export async function removeThisBrowserPush(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await removePushSubscription(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}
