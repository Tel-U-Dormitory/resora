import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Badge — label status / kategori kecil.
 *
 * @example
 * <Badge variant="success" dot>Aktif</Badge>
 */
const variants = {
  neutral: "bg-muted text-slate-700",
  primary: "bg-primary-soft text-primary-soft-foreground",
  solid: "bg-primary text-primary-foreground",
  success: "bg-success-soft text-emerald-700",
  warning: "bg-warning-soft text-amber-700",
  info: "bg-info-soft text-sky-700",
  danger: "bg-danger-soft text-red-700",
  outline: "border border-border text-muted-foreground",
} as const;

const dotColor: Record<keyof typeof variants, string> = {
  neutral: "bg-slate-400",
  primary: "bg-primary",
  solid: "bg-white",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  danger: "bg-danger",
  outline: "bg-slate-400",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants;
  dot?: boolean;
  icon?: React.ReactNode;
}

export function Badge({ variant = "neutral", dot, icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5",
        variants[variant],
        className
      )}
      {...props}
    >
      {dot && <span className={cn("size-1.5 rounded-full", dotColor[variant])} aria-hidden="true" />}
      {icon}
      {children}
    </span>
  );
}
