"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CloseCircle, TickCircle, InfoCircle, Danger, ArrowDown2 } from "iconsax-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * Overlays — Modal, Toast (provider + hook), Tooltip, Accordion.
 * ----------------------------------------------------------------------- */

/** Modal — dialog dengan portal, kunci scroll, tutup via Esc / klik overlay. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-ink/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative w-full animate-scale-in rounded-2xl border border-border bg-surface shadow-lg outline-none",
          { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-2">
          <div>
            <h2 id={titleId} className="text-lg font-bold tracking-tight">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Tutup" className="focus-ring rounded-md p-1 text-slate-400 hover:bg-muted hover:text-foreground">
            <CloseCircle size={22} />
          </button>
        </div>
        {children && <div className="px-6 py-3 text-sm text-slate-600">{children}</div>}
        {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ---------------------------------- Toast --------------------------------- */

type ToastType = "default" | "success" | "info" | "warning" | "error";
interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

const ToastContext = React.createContext<((t: Omit<ToastItem, "id">) => void) | null>(null);

/** useToast — panggil `toast({ type, title, description })` dari mana saja di dalam <ToastProvider>. */
export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam <ToastProvider>");
  return ctx;
}

const toastIcon: Record<ToastType, React.ReactNode> = {
  default: <InfoCircle size={20} variant="Bold" className="text-slate-500" />,
  success: <TickCircle size={20} variant="Bold" className="text-success" />,
  info: <InfoCircle size={20} variant="Bold" className="text-info" />,
  warning: <Danger size={20} variant="Bold" className="text-warning" />,
  error: <CloseCircle size={20} variant="Bold" className="text-danger" />,
};

export function ToastProvider({ children, duration = 4000 }: { children: React.ReactNode; duration?: number }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const push = React.useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), duration);
    },
    [duration]
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[110] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex animate-slide-up items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-lg">
            <span className="mt-0.5 shrink-0">{toastIcon[t.type]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
            </div>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className="focus-ring shrink-0 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold hover:bg-slate-200"
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} aria-label="Tutup notifikasi" className="focus-ring shrink-0 rounded text-slate-400 hover:text-foreground">
              <CloseCircle size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* --------------------------------- Tooltip -------------------------------- */

/** Tooltip — label singkat saat hover/focus. Untuk konten kaya gunakan `content` berupa node. */
export function Tooltip({
  content,
  side = "top",
  children,
}: {
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactElement;
}) {
  const pos = {
    top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
    bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
    left: "right-full top-1/2 mr-2 -translate-y-1/2",
    right: "left-full top-1/2 ml-2 -translate-y-1/2",
  }[side];

  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-64 scale-95 rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-ink-foreground opacity-0 shadow-lg transition-all duration-150 group-focus-within/tooltip:scale-100 group-focus-within/tooltip:opacity-100 group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100",
          pos
        )}
      >
        {content}
      </span>
    </span>
  );
}

/* -------------------------------- Accordion ------------------------------- */

/** Accordion — FAQ / konten bertingkat. `multiple` untuk membuka lebih dari satu. */
export function Accordion({
  items,
  multiple = false,
  defaultOpen = [],
}: {
  items: { id: string; title: string; content: React.ReactNode }[];
  multiple?: boolean;
  defaultOpen?: string[];
}) {
  const [open, setOpen] = React.useState<string[]>(defaultOpen);
  const toggle = (id: string) =>
    setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : multiple ? [...o, id] : [id]));

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-surface">
      {items.map((item) => {
        const isOpen = open.includes(item.id);
        return (
          <div key={item.id}>
            <h3>
              <button
                onClick={() => toggle(item.id)}
                aria-expanded={isOpen}
                aria-controls={`acc-${item.id}`}
                className="focus-ring flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold transition hover:text-primary"
              >
                {item.title}
                <ArrowDown2 size={16} className={cn("shrink-0 text-slate-400 transition-transform duration-300", isOpen && "rotate-180 text-primary")} />
              </button>
            </h3>
            <div
              id={`acc-${item.id}`}
              className={cn("grid transition-all duration-300 ease-[var(--ease-spring)]", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{item.content}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
