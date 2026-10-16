"use client";

import { EmojiPicker } from "frimousse";
import { Sheet } from "@/components/ui/sheet";

// 반응용 전체 이모지 선택기(frimousse, 한국어 검색). 데이터는 처음 열 때 jsDelivr에서 받아 브라우저에 저장한다.
// 무거운 편이라 부모가 next/dynamic으로 ➕를 누를 때만 불러온다.
export default function EmojiPickerSheet({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (emoji: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="반응 고르기">
      <EmojiPicker.Root
        locale="ko"
        columns={8}
        onEmojiSelect={({ emoji }) => {
          onSelect(emoji);
          onClose();
        }}
        className="flex h-[55dvh] w-full flex-col"
      >
        <EmojiPicker.Search
          placeholder="이모지 검색"
          className="mb-2 h-10 w-full rounded-xl bg-muted px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <EmojiPicker.Viewport className="relative flex-1 outline-none">
          <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            불러오는 중…
          </EmojiPicker.Loading>
          <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            찾는 이모지가 없어요
          </EmojiPicker.Empty>
          <EmojiPicker.List
            className="select-none pb-2"
            components={{
              CategoryHeader: ({ category, ...props }) => (
                <div {...props} className="bg-card px-1 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                  {category.label}
                </div>
              ),
              Row: ({ children, ...props }) => (
                <div {...props} className="flex justify-between">
                  {children}
                </div>
              ),
              Emoji: ({ emoji, ...props }) => (
                <button
                  {...props}
                  className="flex size-10 items-center justify-center rounded-lg text-2xl data-[active]:bg-muted"
                >
                  {emoji.emoji}
                </button>
              ),
            }}
          />
        </EmojiPicker.Viewport>
      </EmojiPicker.Root>
    </Sheet>
  );
}
