"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/chat/ScreenHeader";
import { UserAvatar } from "@/components/chat/UserAvatar";
import useAuth, { AUTH_QUERY_KEY } from "@/hooks/useAuth";
import { useLabFlag } from "@/hooks/useLabFlag";
import { usePalette } from "@/hooks/usePalette";
import { usePushNotification } from "@/hooks/usePushNotification";
import { getErrorMessage } from "@/lib/error-handler";
import { STATUS_MESSAGE_MAX } from "@/services/profile-rules";
import { PALETTES, PALETTE_LABELS, THEME_TOKENS } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { signOut } from "@/services/auth";
import { resetMyInviteCode } from "@/services/invites";
import { updateAvatar, updateNickname, updateStatusMessage } from "@/services/profile";
import { displayName, type DomainError } from "@/types/domain";

const MODES = [
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
  { value: "system", label: "기기 설정" },
] as const;
const noSubscribe = () => () => {};

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { palette, setPalette } = usePalette();
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false); // next-themes 값은 브라우저에서만
  const android = useSyncExternalStore(noSubscribe, () => /Android/i.test(navigator.userAgent), () => false);
  const push = usePushNotification();
  const [chiikawa, setChiikawa] = useLabFlag("chiikawa");
  const [nickname, setNickname] = useState<string | null>(null); // null = 편집 전(현재 값 표시)
  const [status, setStatus] = useState<string | null>(null);

  const saveNickname = useMutation({
    mutationFn: updateNickname,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      setNickname(null);
      toast.success("닉네임을 바꿨어요.");
    },
    onError: (e) => toast.error(getErrorMessage(e as unknown as DomainError)),
  });

  const saveStatus = useMutation({
    mutationFn: updateStatusMessage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      setStatus(null);
      toast.success("상태 메시지를 바꿨어요.");
    },
    onError: (e) => toast.error(getErrorMessage(e as unknown as DomainError)),
  });

  const saveAvatar = useMutation({
    mutationFn: updateAvatar,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      toast.success("프로필 사진을 바꿨어요.");
    },
    onError: (e) => toast.error(getErrorMessage(e as unknown as DomainError)),
  });

  const resetInvite = useMutation({
    mutationFn: resetMyInviteCode,
    onSuccess: () => toast.success("새 초대 링크를 만들었어요."),
    onError: (e) => toast.error(getErrorMessage(e as unknown as DomainError)),
  });

  const togglePush = async () => {
    if (push.isSubscribed) {
      if (await push.unsubscribe()) toast.success("알림을 껐어요.");
      else toast.error("알림을 끄지 못했어요.");
      return;
    }
    const result = await push.subscribe();
    if (result === "granted") toast.success("알림을 켰어요.");
    else if (result === "denied") toast.error("브라우저 설정에서 이 사이트의 알림을 허용해 주세요.");
    else if (result === "failed") toast.error("알림을 켜지 못했어요.");
  };

  const logout = async () => {
    await signOut();
    queryClient.clear(); // 이전 사용자 데이터가 다음 로그인에 보이지 않도록
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    router.replace("/login");
  };

  const section = "px-4 pb-2 pt-5 text-xs font-medium text-muted-foreground";
  const row = "pressable-row flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left";

  return (
    <>
      <ScreenHeader title="설정" />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <h2 className={section}>색 테마</h2>
        <div className="grid grid-cols-3 gap-2 px-4" role="radiogroup" aria-label="색 테마">
          {PALETTES.map((p) => {
            const t = THEME_TOKENS[p].light;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={palette === p}
                onClick={() => setPalette(p)}
                className={cn("pressable rounded-xl border-2 p-2 text-sm", palette === p ? "border-primary font-semibold" : "border-border")}
              >
                <div className="mb-1.5 flex h-12 flex-col justify-center gap-1.5 rounded-lg px-2" style={{ background: t.background }}>
                  <div className="h-2.5 w-3/5 rounded-full" style={{ background: t.bubbleThem }} />
                  <div className="ml-auto h-2.5 w-3/5 rounded-full" style={{ background: t.bubbleMe }} />
                </div>
                {PALETTE_LABELS[p]}
              </button>
            );
          })}
        </div>

        <h2 className={section}>밝기</h2>
        <div className="mx-4 flex rounded-xl bg-muted p-1" role="radiogroup" aria-label="밝기">
          {MODES.map((m) => {
            const on = mounted && (theme ?? "system") === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTheme(m.value)}
                className={cn("pressable flex-1 rounded-lg py-2 text-sm", on ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground")}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <h2 className={section}>알림</h2>
        {push.isSupported ? (
          <button type="button" className={row} onClick={() => void togglePush()} disabled={push.isLoading}>
            <span>새 메시지 알림</span>
            <span className={push.isSubscribed ? "font-semibold text-primary" : "text-muted-foreground"}>
              {push.isSubscribed ? "켜짐" : "꺼짐"}
            </span>
          </button>
        ) : (
          <p className="px-4 text-sm text-muted-foreground">이 브라우저는 알림을 지원하지 않아요. 홈 화면에 추가하면 쓸 수 있어요.</p>
        )}
        {/* 안드로이드는 설치한 웹앱의 알림 카테고리를 '보통'으로 만들어 팝업이 안 뜬다. 웹에서 바꿀 방법이 없어 안내만 */}
        {android && push.isSubscribed && (
          <p className="px-4 pt-1 text-xs text-muted-foreground">
            알림이 화면 위에 팝업으로 안 뜨면: 휴대폰 설정 → 애플리케이션 → dongchat → 알림 → 알림 카테고리 → 일반 →
            &lsquo;팝업으로 표시&rsquo;를 켜 주세요.
          </p>
        )}

        <h2 className={section}>내 프로필</h2>
        {user && (
          <label className={cn("pressable mx-4 mb-3 flex w-fit cursor-pointer items-center gap-3", saveAvatar.isPending && "opacity-60")}>
            <UserAvatar name={displayName(user)} src={user.avatarUrl} className="size-16 rounded-[18px] text-xl" />
            <span className="text-sm text-primary">{saveAvatar.isPending ? "올리는 중…" : "사진 바꾸기"}</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={saveAvatar.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // 같은 파일을 다시 골라도 onChange가 오도록
                if (file) saveAvatar.mutate(file);
              }}
            />
          </label>
        )}
        {user && (
          <form
            className="flex items-center gap-2 px-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (nickname !== null) saveNickname.mutate(nickname);
            }}
          >
            <Input
              value={nickname ?? user.nickname ?? ""}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={user.username}
              maxLength={20}
              aria-label="닉네임"
            />
            <Button type="submit" disabled={nickname === null} loading={saveNickname.isPending}>저장</Button>
          </form>
        )}
        <p className="px-4 pt-1 text-xs text-muted-foreground">비워 두면 아이디(@{user?.username})가 보여요.</p>
        {user && (
          <form
            className="flex items-center gap-2 px-4 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (status !== null) saveStatus.mutate(status);
            }}
          >
            <Input
              value={status ?? user.statusMessage ?? ""}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="상태 메시지"
              maxLength={STATUS_MESSAGE_MAX}
              aria-label="상태 메시지"
            />
            <Button type="submit" disabled={status === null} loading={saveStatus.isPending}>저장</Button>
          </form>
        )}

        <h2 className={section}>친구 초대</h2>
        <button
          type="button"
          className={row}
          disabled={resetInvite.isPending}
          onClick={() => confirm("예전 초대 링크는 더 이상 쓸 수 없어요. 새로 만들까요?") && resetInvite.mutate()}
        >
          <span>초대 링크 새로 만들기</span>
          <span className="text-xs text-muted-foreground">{resetInvite.isPending ? "만드는 중…" : "예전 링크 무효"}</span>
        </button>

        <h2 className={section}>실험실</h2>
        <button type="button" role="switch" aria-checked={mounted && chiikawa} className={row} onClick={() => setChiikawa(!chiikawa)}>
          <span>치이카와 배경</span>
          <span className={mounted && chiikawa ? "font-semibold text-primary" : "text-muted-foreground"}>
            {mounted && chiikawa ? "켜짐" : "꺼짐"}
          </span>
        </button>
        <p className="px-4 text-xs text-muted-foreground">이 기기에만 적용돼요.</p>

        <div className="mt-6 divide-y border-y">
          {user?.isAdmin && (
            <Link href="/admin/users" className={row}>
              <span>관리자 화면</span>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Link>
          )}
          <button type="button" className={`${row} text-destructive`} onClick={() => void logout()}>로그아웃</button>
        </div>
      </div>
    </>
  );
}
