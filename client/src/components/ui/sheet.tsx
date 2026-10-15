"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type SheetProps = { open: boolean; onClose: () => void; title?: string; className?: string; children: React.ReactNode };

// 아래에서 올라오는 시트. 네이티브 <dialog>(포커스 가두기·Esc·뒤 화면 비활성)를 쓴다.
export function Sheet({ open, onClose, title, className, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()} // 바깥(backdrop) 클릭
      aria-label={title}
      className={cn(
        "fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-t-2xl border-0 bg-card p-0 text-card-foreground backdrop:bg-black/40",
        className,
      )}
    >
      <div className="px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border" aria-hidden />
        {title && <h2 className="mb-3 text-base font-semibold">{title}</h2>}
        {children}
      </div>
    </dialog>
  );
}
