import * as React from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * Status & Loading — Skeleton, Progress, Spinner, OrbitalLoader, EmptyState.
 * ----------------------------------------------------------------------- */

// Re-export standalone modular components
export { Skeleton } from "./skeleton";
export { Progress } from "./progress";

/** Spinner — indikator loading kecil (inline / tombol). */
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg role="status" aria-label="Memuat" width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn("animate-spin text-primary", className)}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** EmptyState — tampilan saat data kosong / hasil pencarian tidak ditemukan. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <span className="relative mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <span className="absolute inset-0 -z-0 rounded-2xl bg-primary-soft blur-xl" />
        <span className="relative">{icon}</span>
      </span>
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
