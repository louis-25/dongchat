import { ChevronLeft } from "lucide-react";

type Props = { title: string; subtitle?: string; onBack?: () => void; actions?: React.ReactNode };

export function ScreenHeader({ title, subtitle, onBack, actions }: Props) {
  return (
    <header className="flex shrink-0 items-center gap-1 border-b bg-background px-2 pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 min-w-0 flex-1 items-center gap-1">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="뒤로" className="flex size-10 items-center justify-center rounded-full pressable hover:bg-muted active:bg-muted">
            <ChevronLeft className="size-6" />
          </button>
        )}
        <h1 className={`min-w-0 truncate text-lg font-bold ${onBack ? "" : "pl-2"}`}>
          {title}
          {subtitle && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{subtitle}</span>}
        </h1>
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </header>
  );
}
