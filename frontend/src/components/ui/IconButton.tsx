import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "neutral" | "primary" | "danger";
  size?: "sm" | "md";
}

const toneClass: Record<NonNullable<IconButtonProps["tone"]>, string> = {
  neutral: "text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-1)]",
  primary: "text-[var(--state-info)] hover:text-[var(--state-info)] hover:bg-[var(--state-info)]/12",
  danger: "text-[var(--text-muted)] hover:text-[var(--state-error)] hover:bg-[var(--state-error)]/12",
};

const sizeClass: Record<NonNullable<IconButtonProps["size"]>, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, tone = "neutral", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        toneClass[tone],
        sizeClass[size],
        className
      )}
      {...props}
    />
  )
);

IconButton.displayName = "IconButton";
