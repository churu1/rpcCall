import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  dense?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, dense, autoComplete, autoCorrect, autoCapitalize, spellCheck, ...props }, ref) => (
    <input
      ref={ref}
      autoComplete={autoComplete ?? "off"}
      autoCorrect={autoCorrect ?? "off"}
      autoCapitalize={autoCapitalize ?? "off"}
      spellCheck={spellCheck ?? false}
      className={cn("ui-input w-full min-w-0", dense && "h-7 text-[11px]", className)}
      {...props}
    />
  )
);

Input.displayName = "Input";
