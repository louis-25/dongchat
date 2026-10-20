"use client";

import { useCallback, useSyncExternalStore } from "react";
import { rememberReaction } from "@/lib/reactions";

// 최근 단 반응(이 기기에만). 같은 탭은 이벤트로, 다른 탭은 storage 이벤트로 맞춘다.
const KEY = "dongchat.recentReactions";
const EVENT = "dongchat:recent-reactions";
const EMPTY: string[] = [];
let cache: { raw: string | null; list: string[] } = { raw: null, list: EMPTY }; // 스냅샷은 값이 같으면 같은 배열이어야 한다

const read = (): string[] => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cache.raw) {
    let list = EMPTY;
    try {
      const parsed: unknown = JSON.parse(raw ?? "[]");
      if (Array.isArray(parsed)) list = parsed.filter((e): e is string => typeof e === "string");
    } catch {
      // 깨진 값은 무시
    }
    cache = { raw, list };
  }
  return cache.list;
};
const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

export const useRecentReactions = () => {
  const recent = useSyncExternalStore(subscribe, read, () => EMPTY);
  const remember = useCallback((emoji: string) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(rememberReaction(read(), emoji)));
    } catch {
      // 저장 불가(사생활 보호 모드 등)면 기본 줄 그대로
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [recent, remember] as const;
};
