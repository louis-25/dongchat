"use client";

import { Sheet } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { displayName, type Profile } from "@/types/domain";

// 친구 프로필 자세히 보기. 사진을 누르면 원본을 새 탭으로. 아래 버튼(1:1 채팅 등)은 children으로.
export function ProfileSheet({ profile, onClose, children }: { profile: Profile | null; onClose: () => void; children?: React.ReactNode }) {
  return (
    <Sheet open={profile !== null} onClose={onClose} title={profile ? `${displayName(profile)} 프로필` : undefined} className="[&_h2]:sr-only">
      {profile && (
        <div className="flex flex-col items-center gap-3 pt-4 text-center">
          {profile.avatarUrl ? (
            <a href={profile.avatarUrl} target="_blank" rel="noreferrer" className="pressable" aria-label="프로필 사진 크게 보기">
              <UserAvatar name={displayName(profile)} src={profile.avatarUrl} className="size-28 rounded-[32px] text-4xl" />
            </a>
          ) : (
            <UserAvatar name={displayName(profile)} className="size-28 rounded-[32px] text-4xl" />
          )}
          <div className="min-w-0 max-w-full">
            <p className="truncate text-xl font-bold">{displayName(profile)}</p>
            {profile.statusMessage && (
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{profile.statusMessage}</p>
            )}
          </div>
          <div className="mt-3 flex w-full flex-col gap-2">{children}</div>
        </div>
      )}
    </Sheet>
  );
}
