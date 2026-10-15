"use client";

import { useRef } from "react";

const MOVE_TOLERANCE_PX = 10;

// 길게 누르기(터치·마우스) 또는 우클릭으로 onLongPress. 스크롤하려고 움직이면 취소한다.
export const useLongPress = (onLongPress: () => void, ms = 500) => {
  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      clear();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
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
      e.preventDefault();
      clear();
      onLongPress();
    },
  };
};
