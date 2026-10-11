"use client";

import * as React from "react";
import { Copy, TickCircle, Trash, MagicStar, ArrowRight } from "iconsax-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * Signature Buttons — tombol beranimasi khas SIASTRA.
 * Gunakan seperlunya (1 per section) agar tetap terasa spesial.
 * ----------------------------------------------------------------------- */

export interface AuraProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "dual" | "brand" | "rainbow";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
}

/** Aura — Wrapper aura berotasi ala daisyUI v5 dengan dukungan varian dual, brand, atau rainbow */
export function Aura({
  children,
  className,
  variant = "dual",
  size = "md",
  ...props
}: AuraProps) {
  const variantClass =
    variant === "rainbow"
      ? "aura-rainbow"
      : variant === "brand"
        ? "aura-brand"
        : "aura-dual";

  const sizeClass = size !== "md" ? `aura-${size}` : "";

  return (
    <div className={cn("aura", variantClass, sizeClass, className)} {...props}>
      {children}
    </div>
  );
}

export interface AuraButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "dual" | "brand" | "rainbow";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  auraClassName?: string;
  auraStyle?: React.CSSProperties;
  btnStyle?: "primary" | "surface" | "dark" | "glass";
  rainbow?: boolean;
}

/** AuraButton — Tombol dual aura bertenaga sistem daisyUI aura aura-dual dengan rotasi conic-gradient */
export function AuraButton({
  children,
  className,
  variant = "dual",
  size = "md",
  rounded = "xl",
  auraClassName,
  auraStyle,
  btnStyle = "surface",
  rainbow,
  ...props
}: AuraButtonProps) {
  const effectiveVariant = rainbow ? "rainbow" : variant;
  const variantClass =
    effectiveVariant === "rainbow"
      ? "aura-rainbow"
      : effectiveVariant === "brand"
        ? "aura-brand"
        : "aura-dual";

  const sizeClass = size !== "md" ? `aura-${size}` : "";

  const roundedBtnClass =
    rounded === "none"
      ? "rounded-none"
      : rounded === "sm"
        ? "rounded-sm"
        : rounded === "md"
          ? "rounded-md"
          : rounded === "lg"
            ? "rounded-lg"
            : rounded === "2xl"
              ? "rounded-2xl"
              : rounded === "full"
                ? "rounded-full"
                : "rounded-xl";

  const roundedAuraClass =
    rounded === "full"
      ? "rounded-full"
      : rounded === "2xl"
        ? "rounded-2xl"
        : rounded === "lg"
          ? "rounded-lg"
          : rounded === "md"
            ? "rounded-md"
            : rounded === "sm"
              ? "rounded-sm"
              : rounded === "none"
                ? "rounded-none"
                : "rounded-xl";

  const styleClass =
    btnStyle === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary-hover shadow-brand"
      : btnStyle === "dark"
        ? "bg-ink text-white hover:bg-slate-800"
        : btnStyle === "glass"
          ? "bg-white/60 dark:bg-slate-900/60 backdrop-blur-md text-foreground border border-white/50 dark:border-white/10 shadow-sm hover:bg-white/80 dark:hover:bg-slate-900/80"
          : "bg-surface text-foreground border border-border/80 hover:bg-muted shadow-xs";

  return (
    <div
      className={cn("aura", variantClass, sizeClass, roundedAuraClass, auraClassName)}
      style={auraStyle}
    >
      <button
        className={cn(
          "focus-ring inline-flex h-11 items-center gap-2 px-6 text-sm font-bold transition-all duration-200 active:scale-[0.98]",
          roundedBtnClass,
          styleClass,
          className
        )}
        {...props}
      >
        <MagicStar size={18} variant="Bold" className={btnStyle === "primary" ? "text-amber-200" : "text-primary"} />
        {children}
      </button>
    </div>
  );
}

/** CopyButton — morphing "Salin" → "Tersalin!" dengan feedback 2 detik. */
export function CopyButton({
  value,
  label = "Salin",
  copiedLabel = "Tersalin!",
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      aria-live="polite"
      className={cn(
        "focus-ring relative inline-flex h-10 min-w-[116px] items-center justify-center overflow-hidden rounded-md border px-4 text-sm font-semibold transition-all duration-300",
        copied
          ? "border-primary/30 bg-primary-soft text-primary"
          : "border-border bg-surface text-foreground shadow-xs hover:bg-muted",
        className
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 transition-all duration-300 ease-[var(--ease-spring)]",
          copied ? "-translate-y-8 opacity-0" : "translate-y-0 opacity-100"
        )}
      >
        <Copy size={16} variant="Linear" />
        {label}
      </span>
      <span
        className={cn(
          "absolute flex items-center gap-1.5 transition-all duration-300 ease-[var(--ease-spring)]",
          copied ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        )}
      >
        <TickCircle size={16} variant="Bold" />
        {copiedLabel}
      </span>
    </button>
  );
}

/** DeleteButton — ikon bulat yang melebar menjadi pill merah saat hover. */
export function DeleteButton({
  label = "Hapus",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <button
      aria-label={label}
      className={cn(
        "focus-ring group relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-ink text-white shadow-md transition-all duration-300 ease-[var(--ease-spring)] hover:w-32 hover:bg-danger hover:shadow-[0_10px_20px_-6px_rgb(220_38_38/0.5)]",
        className
      )}
      {...props}
    >
      <Trash
        size={18}
        variant="Bold"
        className="transition-transform duration-300 group-hover:translate-y-10"
      />
      <span className="absolute -translate-y-10 text-sm font-semibold opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}

/** IsoIconButton — tombol ikon dengan layer belakang yang berotasi (efek 3D isometrik). */
export function IsoIconButton({
  icon,
  label,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn("focus-ring group relative size-11 rounded-md", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-md bg-ink transition-all duration-300 ease-[var(--ease-spring)] group-hover:rotate-[32deg] group-hover:bg-primary group-hover:shadow-brand"
      />
      <span className="relative flex size-full items-center justify-center rounded-md border border-white/15 bg-ink/40 text-white backdrop-blur-sm transition group-hover:bg-white/10">
        {icon}
      </span>
    </button>
  );
}

/** GradientButton — sapuan gradien merah→amber dari kiri ke kanan saat hover. */
export function GradientButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "focus-ring group relative isolate inline-flex h-11 items-center gap-2 overflow-hidden rounded-full bg-ink px-6 text-sm font-semibold text-white shadow-md",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 origin-left scale-x-0 bg-gradient-to-r from-primary to-warning transition-transform duration-500 ease-[var(--ease-spring)] group-hover:scale-x-100"
      />
      {children}
      <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
    </button>
  );
}
