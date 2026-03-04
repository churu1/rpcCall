import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "info" | "success" | "warn" | "danger";
}

const toneClass: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "text-[var(--text-muted)]",
  info: "text-[var(--state-info)]",
  success: "text-[var(--state-success)]",
  warn: "text-[var(--state-warn)]",
  danger: "text-[var(--state-error)]",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return <span className={cn("ui-badge", toneClass[tone], className)} {...props} />;
}

