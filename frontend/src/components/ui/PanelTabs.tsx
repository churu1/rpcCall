import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PanelTabItem<T extends string> {
  key: T;
  label: ReactNode;
}

interface PanelTabsProps<T extends string> {
  tabs: PanelTabItem<T>[];
  active: T;
  onChange: (key: T) => void;
  className?: string;
}

export function PanelTabs<T extends string>({ tabs, active, onChange, className }: PanelTabsProps<T>) {
  return (
    <div className={cn("flex items-center gap-1 px-1.5 py-1 min-w-max", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={cn(
            "h-7 px-2.5 rounded-md text-[11px] border transition-colors whitespace-nowrap shrink-0",
            active === tab.key
              ? "border-[var(--state-info)]/35 bg-[var(--state-info)]/14 text-[var(--text-strong)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--surface-1)]"
          )}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
