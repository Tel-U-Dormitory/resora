import * as React from "react";
import { cn } from "@/lib/utils";

/** Skeleton — placeholder shimmer animasi saat data dimuat. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-shimmer rounded-md bg-[linear-gradient(90deg,#f1f5f9_0%,#e2e8f0_50%,#f1f5f9_100%)] bg-[length:200%_100%]",
        className
      )}
    />
  );
}
