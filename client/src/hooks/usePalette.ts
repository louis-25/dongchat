"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_PALETTE, PALETTE_STORAGE_KEY, isPalette, type Palette } from "@/lib/theme";

const EVENT = "dongchat:palette";
const read = (): Palette => {
  const v = document.documentElement.dataset.palette;
  return isPalette(v) ? v : DEFAULT_PALETTE;
};
const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
};

// 색 테마(이 기기에만 저장). 밝기는 next-themes가 따로 관리한다.
export const usePalette = () => {
  const palette = useSyncExternalStore(subscribe, read, () => DEFAULT_PALETTE);
  const setPalette = useCallback((p: Palette) => {
    if (p === DEFAULT_PALETTE) delete document.documentElement.dataset.palette;
    else document.documentElement.dataset.palette = p;
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, p);
    } catch {
      // 저장 불가면 이번 방문에만 적용
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { palette, setPalette };
};
