"use client";

import { useCallback, useSyncExternalStore } from "react";

// 설정 > 실험실 스위치(이 기기에만 저장). 같은 탭의 다른 컴포넌트는 이벤트로, 다른 탭은 storage 이벤트로 맞춘다.
const EVENT = "dongchat:lab";
const storageKey = (flag: string) => `dongchat.lab.${flag}`;

const read = (flag: string) => {
  try {
    return localStorage.getItem(storageKey(flag)) === "1";
  } catch {
    return false;
  }
};
const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

export const useLabFlag = (flag: string) => {
  const on = useSyncExternalStore(subscribe, () => read(flag), () => false);
  const set = useCallback(
    (next: boolean) => {
      try {
        if (next) localStorage.setItem(storageKey(flag), "1");
        else localStorage.removeItem(storageKey(flag));
      } catch {
        // 저장 불가(사생활 보호 모드 등)면 바뀌지 않는다
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [flag],
  );
  return [on, set] as const;
};
