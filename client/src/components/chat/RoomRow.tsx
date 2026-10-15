import Link from "next/link";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { badgeText, formatListTime, previewText } from "@/lib/format";
import { markInAppNav } from "@/lib/nav";
import { roomPath } from "@/lib/push-url";
import { displayName, roomTitle, type Room, type RoomSummary } from "@/types/domain";

type Props = { summary: RoomSummary; room: Room | undefined; me: string };

export function RoomRow({ summary, room, me }: Props) {
  const title = room ? roomTitle(room, me) : (summary.name ?? "채팅방");
  const other = !summary.isGroup ? room?.participants.find((p) => p.user.id !== me)?.user : undefined;
  const nameOf = (id: string) => {
    const u = room?.participants.find((p) => p.user.id === id)?.user;
    return u ? displayName(u) : "알 수 없음";
  };
  const badge = badgeText(summary.unreadCount);
  return (
    <li>
      <Link
        href={roomPath(summary.id)}
        onClick={() => markInAppNav()}
        className="flex items-center gap-3 px-4 py-2.5 active:bg-muted"
      >
        <UserAvatar name={other ? displayName(other) : title} src={other?.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">
            {title}
            {summary.isGroup && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{summary.memberCount}</span>}
          </div>
          <div className="truncate text-sm text-muted-foreground">{previewText(summary, { me, senderName: nameOf })}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 self-start pt-0.5">
          <time className="text-xs text-muted-foreground tabular-nums">
            {formatListTime(summary.lastMessage?.at ?? summary.createdAt)}
          </time>
          {badge && (
            <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-bold leading-5 text-primary-foreground tabular-nums">
              {badge}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
