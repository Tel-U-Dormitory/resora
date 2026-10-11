"use client";

import * as React from "react";
import { ArrowLeft2, ArrowRight2, ArrowRight3, Home2, More } from "iconsax-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * Navigation helpers — Tabs (glider), Breadcrumb, Pagination, DropdownMenu.
 * ----------------------------------------------------------------------- */

/** Tabs — segmented control dengan indikator "glider" yang meluncur. */
export function Tabs({
  items,
  value,
  defaultValue,
  onChange,
  variant = "pill",
  fullWidth = false,
  className,
}: {
  items: { value: string; label: string; count?: number }[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  variant?: "pill" | "underline";
  fullWidth?: boolean;
  className?: string;
}) {
  const [inner, setInner] = React.useState(defaultValue ?? items[0]?.value);
  const current = value ?? inner;
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = React.useState({ left: 0, width: 0 });

  React.useEffect(() => {
    const updateIndicator = () => {
      const idx = items.findIndex((i) => i.value === current);
      const el = refs.current[idx];
      if (el) {
        setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
      }
    };
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [current, items]);

  const select = (v: string) => {
    setInner(v);
    onChange?.(v);
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    const next = (i + dir + items.length) % items.length;
    refs.current[next]?.focus();
    select(items[next].value);
  };

  const pill = variant === "pill";

  return (
    <div
      role="tablist"
      className={cn(
        "relative items-center",
        fullWidth ? "flex w-full" : "inline-flex",
        pill ? "rounded-full border border-border bg-muted p-1" : "gap-1 border-b border-border",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute transition-all duration-300 ease-[var(--ease-spring)] pointer-events-none",
          pill ? "top-1 bottom-1 rounded-full bg-surface shadow-xs" : "-bottom-px h-0.5 rounded-full bg-primary"
        )}
        style={{ left: indicator.left, width: indicator.width }}
      />
      {items.map((item, i) => {
        const active = item.value === current;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => select(item.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "focus-ring relative z-10 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap",
              fullWidth && "flex-1",
              pill ? "rounded-full px-3 sm:px-4 py-1.5 sm:py-2" : "px-3 py-2.5",
              active ? (pill ? "text-primary" : "text-foreground") : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-bold leading-none",
                  active ? "bg-primary-soft text-primary" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Breadcrumb — jejak navigasi halaman. Item terakhir = halaman aktif. */
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {last ? (
                <span aria-current="page" className="font-semibold text-foreground">{item.label}</span>
              ) : (
                <a href={item.href ?? "#"} className="focus-ring flex items-center gap-1 rounded text-muted-foreground transition hover:text-primary">
                  {i === 0 && <Home2 size={15} />}
                  {item.label}
                </a>
              )}
              {!last && <ArrowRight3 size={12} className="text-slate-300" variant="Bold" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Pagination — dengan ellipsis otomatis. */
export function Pagination({
  total,
  page,
  defaultPage = 1,
  onChange,
}: {
  total: number;
  page?: number;
  defaultPage?: number;
  onChange?: (p: number) => void;
}) {
  const [inner, setInner] = React.useState(defaultPage);
  const current = page ?? inner;
  const go = (p: number) => {
    if (p < 1 || p > total) return;
    setInner(p);
    onChange?.(p);
  };

  const pages: (number | "…")[] = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - current) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }

  const btn = "focus-ring flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-semibold transition";

  return (
    <nav aria-label="Pagination" className="flex items-center gap-1">
      <button onClick={() => go(current - 1)} disabled={current === 1} aria-label="Sebelumnya" className={cn(btn, "text-slate-600 hover:bg-muted disabled:opacity-40")}>
        <ArrowLeft2 size={16} />
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-slate-400">…</span>
        ) : (
          <button
            key={p}
            onClick={() => go(p)}
            aria-current={p === current ? "page" : undefined}
            className={cn(btn, p === current ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-muted")}
          >
            {p}
          </button>
        )
      )}
      <button onClick={() => go(current + 1)} disabled={current === total} aria-label="Berikutnya" className={cn(btn, "text-slate-600 hover:bg-muted disabled:opacity-40")}>
        <ArrowRight2 size={16} />
      </button>
    </nav>
  );
}

/** DropdownMenu — menu aksi kontekstual (klik di luar / Esc untuk menutup). */
export interface DropdownItem {
  label: string;
  icon?: React.ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  separator?: boolean;
}

export function DropdownMenu({
  items,
  trigger,
  align = "end",
  label,
}: {
  items: DropdownItem[];
  trigger?: React.ReactNode;
  align?: "start" | "end";
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Buka menu"
        className="focus-ring inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface text-slate-600 shadow-xs transition hover:bg-muted"
      >
        {trigger ?? <More size={18} />}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-40 mt-2 w-56 origin-top animate-scale-in rounded-xl border border-border bg-surface p-1.5 shadow-lg",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          {label && <p className="px-2.5 py-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">{label}</p>}
          {items.map((item, i) =>
            item.separator ? (
              <div key={`s${i}`} className="my-1 h-px bg-border" />
            ) : (
              <button
                key={item.label}
                role="menuitem"
                onClick={() => {
                  item.onSelect?.();
                  setOpen(false);
                }}
                className={cn(
                  "focus-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
                  item.danger ? "text-danger hover:bg-danger-soft" : "text-slate-700 hover:bg-muted hover:text-foreground"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
