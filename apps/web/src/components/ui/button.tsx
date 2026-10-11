import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Button — primitive aksi utama SIASTRA.
 *
 * @example
 * <Button>Daftar Sekarang</Button>
 * <Button variant="outline" size="sm" leftIcon={<Add size={16} />}>Tambah</Button>
 * <Button variant="danger" loading>Menghapus...</Button>
 */
const variants = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover hover:shadow-brand",
  secondary: "bg-primary-soft text-primary-soft-foreground hover:bg-[#fddcd9]",
  outline: "border border-border bg-surface text-foreground shadow-xs hover:bg-muted",
  ghost: "text-foreground hover:bg-muted",
  dark: "bg-ink text-ink-foreground shadow-sm hover:bg-slate-800",
  danger: "bg-danger text-white shadow-sm hover:bg-red-700",
  link: "text-primary underline-offset-4 hover:underline px-0 h-auto",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-12 px-6 text-sm gap-2 rounded-lg",
  icon: "h-10 w-10 rounded-md",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "focus-ring inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {loading ? <Spinner /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
