"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { INSTALL_DISMISS_KEY, installMode } from "@/lib/install";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const EVENT = "dongchat:install";

const snapshot = (): string => {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === "1";
  } catch {
    dismissed = false;
  }
  return `${+standalone}${+ios}${+dismissed}`;
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};

export const useInstallPrompt = () => {
  const env = useSyncExternalStore(subscribe, snapshot, () => "100"); // 서버: standalone 취급(안 보임)
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // 브라우저 기본 미니 배너 대신 우리 배너
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    } catch {
      // 저장 불가면 이번 방문에만 숨김
    }
    setEvent(null);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const install = useCallback(async () => {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    dismiss();
  }, [event, dismiss]);

  const mode = installMode({ standalone: env[0] === "1", ios: env[1] === "1", dismissed: env[2] === "1", canPrompt: event !== null });
  return { mode, install, dismiss };
};
