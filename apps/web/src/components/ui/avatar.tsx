import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Avatar — foto profil dengan fallback inisial & indikator status.
 *
 * @example
 * <Avatar src="/me.jpg" name="Nabil Fikry" status="online" />
 * <AvatarGroup max={3}>{...}</AvatarGroup>
 */
const sizes = {
  sm: "size-8 text-[11px]",
  md: "size-10 text-xs",
  lg: "size-14 text-base",
} as const;

export interface AvatarProps {
  src?: string;
  name: string;
  size?: keyof typeof sizes;
  shape?: "circle" | "squircle";
  status?: "online" | "away" | "offline";
  className?: string;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

const statusColor = { online: "bg-success", away: "bg-warning", offline: "bg-slate-300" };

export function Avatar({ src, name, size = "md", shape = "circle", status, className }: AvatarProps) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center overflow-hidden bg-gradient-to-br from-primary to-warning font-bold text-white ring-2 ring-surface",
          shape === "circle" ? "rounded-full" : "rounded-[35%]",
          sizes[size]
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name} className="size-full object-cover" />
        ) : (
          <span aria-label={name}>{initials(name)}</span>
        )}
      </span>
      {status && (
        <span
          className={cn(
            "absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-surface",
            statusColor[status]
          )}
          aria-label={status}
        />
      )}
    </span>
  );
}

export function AvatarGroup({ children, max = 4 }: { children: React.ReactNode; max?: number }) {
  const items = React.Children.toArray(children);
  const extra = items.length - max;
  return (
    <div className="flex -space-x-2.5">
      {items.slice(0, max)}
      {extra > 0 && (
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-muted text-xs font-bold text-slate-600 ring-2 ring-surface">
          +{extra}
        </span>
      )}
    </div>
  );
}
