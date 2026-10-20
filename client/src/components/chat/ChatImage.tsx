"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { useImageUrl } from "@/hooks/useImageUrl";
import { albumRows } from "@/lib/album";
import { cn } from "@/lib/utils";

// 말풍선 사진(1~10장). 크기 고정(불러오는 동안 스크롤이 밀리지 않음), 누르면 전체 화면에서 좌우로 넘긴다.
export function ChatImage({ paths }: { paths: string[] }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  return (
    <>
      {paths.length === 1 ? (
        <Tile path={paths[0]} onOpen={() => setOpenAt(0)} className="size-60 max-w-[60vw] rounded-[14px]" />
      ) : (
        <div className="flex w-60 max-w-[60vw] flex-col gap-0.5 overflow-hidden rounded-[14px]">
          {albumRows(paths.length).map((cols, r, rows) => {
            const from = rows.slice(0, r).reduce((a, b) => a + b, 0);
            const row = paths.slice(from, from + cols).map((path, i) => ({ path, index: from + i }));
            return (
              <div key={row[0].index} className="flex gap-0.5">
                {row.map(({ path, index }) => (
                  <Tile key={path} path={path} onOpen={() => setOpenAt(index)} className="aspect-square min-w-0 flex-1" />
                ))}
              </div>
            );
          })}
        </div>
      )}
      {openAt !== null && <ImageViewer paths={paths} start={openAt} onClose={() => setOpenAt(null)} />}
    </>
  );
}

function Tile({ path, onOpen, className }: { path: string; onOpen: () => void; className?: string }) {
  const { data: url, isError } = useImageUrl(path);
  return (
    <button type="button" onClick={() => url && onOpen()} className={cn("block overflow-hidden bg-muted", className)} aria-label="사진 크게 보기">
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
  );
}

// 전체 화면. 여러 장이면 좌우로 넘기고(CSS scroll-snap) 위에 "2/5".
function ImageViewer({ paths, start, onClose }: { paths: string[]; start: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  useEffect(() => {
    ref.current?.showModal();
    const t = track.current;
    if (t) t.scrollLeft = start * t.clientWidth;
  }, [start]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={() => ref.current?.close()}
      aria-label="사진"
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 backdrop:bg-black"
    >
      <div
        ref={track}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none]"
      >
        {paths.map((path) => (
          <Slide key={path} path={path} />
        ))}
      </div>
      {paths.length > 1 && (
        <span className="absolute left-1/2 top-[calc(env(safe-area-inset-top)+12px)] -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white tabular-nums">
          {index + 1}/{paths.length}
        </span>
      )}
    </dialog>
  );
}

function Slide({ path }: { path: string }) {
  const { data: url } = useImageUrl(path);
  return (
    <div className="size-full shrink-0 snap-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL(외부 Storage) */}
      {url && <img src={url} alt="" className="size-full object-contain" />}
    </div>
  );
}
