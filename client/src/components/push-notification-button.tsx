"use client";

import { Button } from "@/components/ui/button";
import { usePushNotification } from "@/hooks/usePushNotification";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

export function PushNotificationButton() {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  } = usePushNotification();

  if (!isSupported) {
    return null;
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      const success = await unsubscribe();
      if (success) {
        toast.success("푸시 알림이 해제되었습니다.");
      } else {
        toast.error("푸시 알림 해제에 실패했습니다.");
      }
    } else {
      // 권한 요청
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const success = await subscribe();
        if (success) {
          toast.success("푸시 알림이 활성화되었습니다.");
        } else {
          toast.error("푸시 알림 활성화에 실패했습니다.");
        }
      } else if (permission === "denied") {
        toast.error("브라우저에서 푸시 알림 권한이 거부되었습니다.");
      }
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={isLoading}
    >
      {isSubscribed ? (
        <>
          <BellOff className="mr-2 h-4 w-4" />
          알림 해제
        </>
      ) : (
        <>
          <Bell className="mr-2 h-4 w-4" />
          알림 활성화
        </>
      )}
    </Button>
  );
}

