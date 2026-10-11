import * as React from "react";
import { InfoCircle, TickCircle, Danger, CloseCircle } from "iconsax-react";
import { cn } from "@/lib/utils";

/**
 * Alert — pesan kontekstual inline (bukan toast).
 *
 * @example
 * <Alert variant="warning" title="Batas waktu">Pembayaran berakhir 2 jam lagi.</Alert>
 */
const config = {
  info: { cls: "border-sky-200 bg-info-soft text-sky-900", icon: InfoCircle, iconCls: "text-info" },
  success: { cls: "border-emerald-200 bg-success-soft text-emerald-900", icon: TickCircle, iconCls: "text-success" },
  warning: { cls: "border-amber-200 bg-warning-soft text-amber-900", icon: Danger, iconCls: "text-warning" },
  danger: { cls: "border-red-200 bg-danger-soft text-red-900", icon: CloseCircle, iconCls: "text-danger" },
} as const;

export interface AlertProps {
  variant?: keyof typeof config;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export function Alert({ variant = "info", title, children, action, onClose, className }: AlertProps) {
  const { cls, icon: Icon, iconCls } = config[variant];
  return (
    <div role="alert" className={cn("flex gap-3 rounded-lg border p-4", cls, className)}>
      <Icon size={20} variant="Bold" className={cn("mt-0.5 shrink-0", iconCls)} />
      <div className="flex-1">
        <p className="text-sm font-bold">{title}</p>
        {children && <div className="mt-1 text-sm opacity-80">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Tutup"
          className="focus-ring -m-1 h-fit rounded-md p-1 opacity-60 transition hover:opacity-100"
        >
          <CloseCircle size={18} variant="Linear" />
        </button>
      )}
    </div>
  );
}
