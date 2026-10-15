import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// 사진이 있으면 사진(카카오 프로필), 없거나 실패하면 이름 첫 글자.
export function UserAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <Avatar className={cn("size-11 rounded-[12px]", className)}>
      {src ? <AvatarImage src={src} alt="" className="object-cover" /> : null}
      <AvatarFallback className="rounded-[12px] bg-primary/12 font-semibold text-primary">
        {[...name][0]?.toUpperCase() ?? "?"}
      </AvatarFallback>
    </Avatar>
  );
}
