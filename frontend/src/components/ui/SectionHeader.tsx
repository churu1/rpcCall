import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  right?: ReactNode;
}

export function SectionHeader({ title, right, className, ...props }: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "h-8 px-2 flex items-center justify-between border-b border-[var(--line-soft)] text-[11px] font-medium tracking-wide text-[var(--text-muted)] uppercase",
        className
      )}
      {...props}
    >
      <span className="truncate">{title}</span>
      {right ? <div className="flex items-center gap-1">{right}</div> : null}
    </div>
  );
}
