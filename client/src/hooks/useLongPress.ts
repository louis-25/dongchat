"use client";

import { useRef } from "react";

const MOVE_TOLERANCE_PX = 10;

// 말풍선 안 입력칸·시트(투표 카드)에서는 길게 누르기를 쓰지 않는다 — 붙여넣기 메뉴를 막거나 시트 위에서 메뉴가 뜨지 않게
export const ignoresLongPress = (target: EventTarget | null): boolean =>
  !!(target as Element | null)?.closest?.("input, textarea, dialog");

// 길게 누르기(터치·마우스) 또는 우클릭으로 onLongPress. 스크롤하려고 움직이면 취소한다.
// 길게 누른 뒤 손을 떼면 오는 click은 막는다(안쪽 버튼·사진이 함께 열리지 않게).
export const useLongPress = (onLongPress: () => void, ms = 500) => {
  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const fired = useRef(false);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || ignoresLongPress(e.target)) return;
      clear();
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        onLongPress();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE_PX) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      if (ignoresLongPress(e.target)) return;
      e.preventDefault();
      clear();
      fired.current = true;
      onLongPress();
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
};
