"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { useImageUrl } from "@/hooks/useImageUrl";

// 말풍선 사진. 정사각형 썸네일(크기 고정 → 불러오는 동안 스크롤이 밀리지 않음), 누르면 전체 화면.
export function ChatImage({ path }: { path: string }) {
  const { data: url, isError } = useImageUrl(path);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        className="block size-60 max-w-[60vw] overflow-hidden rounded-[14px] bg-muted"
        aria-label="사진 크게 보기"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 서명 URL(외부 Storage)
          <img src={url} alt="" className="size-full object-cover" draggable={false} />
        ) : isError ? (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" aria-label="사진을 불러오지 못했어요" />
          </span>
        ) : (
          <span className="block size-full animate-pulse" />
        )}
      </button>
      {open && url && <ImageViewer url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImageViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={() => ref.current?.close()}
      aria-label="사진"
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 backdrop:bg-black"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL(외부 Storage) */}
      <img src={url} alt="" className="size-full object-contain" />
    </dialog>
  );
}
