"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * Toggles & Choice — Switch, FlipToggle, RadioTiles, Rating.
 * ----------------------------------------------------------------------- */

/** Switch — toggle on/off standar (role="switch"). */
export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  disabled,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [inner, setInner] = React.useState(defaultChecked);
  const on = checked ?? inner;
  const toggle = () => {
    setInner(!on);
    onCheckedChange?.(!on);
  };

  return (
    <label className={cn("inline-flex items-center gap-3", disabled ? "opacity-50" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "focus-ring relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
          on ? "bg-primary" : "bg-slate-300"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 flex size-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-300 ease-[var(--ease-spring)]",
            on && "translate-x-5"
          )}
        >
          <svg viewBox="0 0 24 24" className={cn("size-3 transition-opacity", on ? "text-primary opacity-100" : "opacity-0")} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" aria-hidden="true">
            <path d="M5 12l5 5L20 7" />
          </svg>
        </span>
      </button>
      {label && <span className="text-sm font-medium text-foreground">{label}</span>}
    </label>
  );
}

/** FlipToggle — toggle 3D yang berputar 180° (signature). Cocok untuk status publikasi. */
export function FlipToggle({
  defaultChecked = true,
  onLabel = "Aktif",
  offLabel = "Nonaktif",
  onCheckedChange,
}: {
  defaultChecked?: boolean;
  onLabel?: string;
  offLabel?: string;
  onCheckedChange?: (v: boolean) => void;
}) {
  const [on, setOn] = React.useState(defaultChecked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        setOn(!on);
        onCheckedChange?.(!on);
      }}
      className="focus-ring relative h-9 w-24 rounded-full [perspective:200px]"
    >
      {[
        { text: offLabel, cls: "bg-slate-500", rot: on ? "[transform:rotateY(180deg)]" : "[transform:rotateY(0deg)]" },
        { text: onLabel, cls: "bg-primary", rot: on ? "[transform:rotateY(0deg)]" : "[transform:rotateY(-180deg)]" },
      ].map((face) => (
        <span
          key={face.text}
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full text-xs font-bold text-white transition-transform duration-500 ease-[var(--ease-spring)] [backface-visibility:hidden]",
            face.cls,
            face.rot
          )}
        >
          {face.text}
        </span>
      ))}
    </button>
  );
}

/** RadioTiles — pilihan berbentuk kartu dengan ikon besar. */
export function RadioTiles({
  name,
  options,
  value,
  defaultValue,
  onChange,
}: {
  name: string;
  options: { value: string; label: string; description?: string; icon: React.ReactNode }[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
}) {
  const [inner, setInner] = React.useState(defaultValue ?? options[0]?.value);
  const current = value ?? inner;

  return (
    <div role="radiogroup" className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
      {options.map((o) => {
        const checked = current === o.value;
        return (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => {
                setInner(o.value);
                onChange?.(o.value);
              }}
              className="peer sr-only"
            />
            <span
              className={cn(
                "relative flex h-full flex-col items-center gap-2 rounded-xl border-2 bg-surface p-4 text-center transition-all duration-200 peer-focus-visible:ring-4 peer-focus-visible:ring-ring/50",
                checked ? "border-primary bg-primary-soft/40 shadow-md" : "border-border hover:border-slate-300"
              )}
            >
              <span
                className={cn(
                  "absolute top-2.5 left-2.5 flex size-4 items-center justify-center rounded-full border-2 transition-all",
                  checked ? "scale-100 border-primary bg-primary" : "scale-90 border-slate-300"
                )}
              >
                {checked && <span className="size-1.5 rounded-full bg-white" />}
              </span>
              <span className={cn("mt-2 transition-transform duration-300", checked ? "scale-110 text-primary" : "text-slate-500")}>
                {o.icon}
              </span>
              <span className={cn("text-sm font-bold", checked ? "text-primary" : "text-foreground")}>{o.label}</span>
              {o.description && <span className="text-xs text-muted-foreground">{o.description}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Rating — bintang interaktif dengan animasi "pop" saat dipilih. */
export function Rating({
  max = 5,
  defaultValue = 0,
  onChange,
  readOnly,
}: {
  max?: number;
  defaultValue?: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}) {
  const [value, setValue] = React.useState(defaultValue);
  const [hover, setHover] = React.useState(0);
  const shown = hover || value;

  return (
    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} bintang`}
          disabled={readOnly}
          onMouseEnter={() => !readOnly && setHover(n)}
          onClick={() => {
            setValue(n);
            onChange?.(n);
          }}
          className="focus-ring rounded transition-transform hover:scale-115 disabled:hover:scale-100"
        >
          <svg
            viewBox="0 0 24 24"
            className={cn(
              "size-7 transition-colors duration-200",
              n <= shown ? "fill-warning stroke-warning" : "fill-transparent stroke-slate-300",
              n <= value && "animate-[star-pop_0.45s_var(--ease-spring)]"
            )}
            strokeWidth="1.5"
            strokeLinejoin="round"
          >
            <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
        </button>
      ))}
    </div>
  );
}
