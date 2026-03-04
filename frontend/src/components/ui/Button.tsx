import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  dense?: boolean;
}

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-7 px-2 text-[11px]",
  md: "h-8 px-3 text-xs",
};

const variantClass: Record<ButtonVariant, string> = {
  primary: "ui-btn ui-btn-primary",
  secondary: "ui-btn",
  ghost: "h-8 px-2 text-xs rounded-md border border-transparent bg-transparent hover:bg-[var(--surface-1)]",
  danger: "ui-btn text-[var(--state-error)] hover:bg-[var(--state-error)]/12",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", dense, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        variantClass[variant],
        sizeClass[size],
        dense && "h-7 px-2 text-[11px]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
);

Button.displayName = "Button";
