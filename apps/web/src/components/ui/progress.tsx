import * as React from "react";
import { cn } from "@/lib/utils";

/** Progress — bar indikator proses linear. `value` 0–100. */
export function Progress({
  value,
  label,
  showValue = true,
  tone = "primary",
}: {
  value: number;
  label?: string;
  showValue?: boolean;
  tone?: "primary" | "success" | "warning";
}) {
  const v = Math.min(100, Math.max(0, value));
  const color = { primary: "bg-primary", success: "bg-success", warning: "bg-warning" }[tone];
  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="mb-1.5 flex justify-between text-xs font-semibold">
          <span className="text-foreground">{label}</span>
          {showValue && <span className="text-muted-foreground">{v}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-[var(--ease-spring)]",
            color
          )}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}
