"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

export function InstallBanner() {
  const { mode, install, dismiss } = useInstallPrompt();
  if (!mode) return null;
  return (
    <div className="mx-3 mb-3 flex items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-sm text-background">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground">d</div>
      <p className="min-w-0 flex-1">
        {mode === "prompt" ? "홈 화면에 추가하면 앱처럼 쓸 수 있어요" : "공유 버튼 → ‘홈 화면에 추가’로 앱처럼 쓸 수 있어요"}
      </p>
      {mode === "prompt" && <Button size="sm" onClick={() => void install()}>추가</Button>}
      <button type="button" onClick={dismiss} aria-label="설치 안내 닫기" className="p-1 opacity-70">
        <X className="size-4" />
      </button>
    </div>
  );
}
