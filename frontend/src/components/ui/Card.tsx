import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  dense?: boolean;
}

export function Card({ className, dense, ...props }: CardProps) {
  return <div className={cn("ui-card", dense && "rounded-md", className)} {...props} />;
}

