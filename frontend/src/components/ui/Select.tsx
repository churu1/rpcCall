import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  dense?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, dense, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn("ui-input pr-8", dense && "h-7 text-[11px]", className)}
      {...props}
    >
      {children}
    </select>
  )
);

Select.displayName = "Select";

