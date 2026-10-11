"use client";

import * as React from "react";
import { Eye, EyeSlash, ArrowDown2, TickSquare, DocumentUpload, CloseCircle } from "iconsax-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * Form Controls — Input, Textarea, Select, Checkbox, Field wrapper.
 * Semua kontrol: tinggi 44px, radius md, focus ring brand, state error.
 * ----------------------------------------------------------------------- */

const controlBase =
  "w-full rounded-md border border-input bg-surface text-sm text-foreground shadow-xs transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60";

/** Field — label + hint + pesan error, dipakai membungkus kontrol apa pun. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-foreground">
          {label}
          {required && <span className="ml-0.5 text-primary">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  invalid?: boolean;
}

/** Input — mendukung ikon kiri dan toggle tampil/sembunyi untuk type="password". */
export function Input({ leftIcon, invalid, type = "text", className, ...props }: InputProps) {
  const [show, setShow] = React.useState(false);
  const isPassword = type === "password";

  return (
    <div className="relative">
      {leftIcon && (
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400">
          {leftIcon}
        </span>
      )}
      <input
        type={isPassword && show ? "text" : type}
        aria-invalid={invalid || undefined}
        className={cn(
          controlBase,
          "h-11 px-3.5",
          leftIcon && "pl-10",
          isPassword && "pr-10",
          invalid && "border-danger focus:border-danger focus:ring-red-200",
          className
        )}
        {...props}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
          className="focus-ring absolute top-1/2 right-3 -translate-y-1/2 rounded text-slate-400 hover:text-slate-600"
        >
          {show ? <EyeSlash size={18} /> : <Eye size={18} />}
        </button>
      )}
    </div>
  );
}

export function Textarea({
  invalid,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(controlBase, "min-h-24 resize-y px-3.5 py-2.5", invalid && "border-danger", className)}
      {...props}
    />
  );
}

/** Select — custom listbox, dapat dioperasikan dengan keyboard (↑ ↓ Enter Esc). */
export function Select({
  options,
  value,
  onChange,
  placeholder = "Pilih salah satu",
  className,
}: {
  options: { value: string; label: string }[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  React.useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (v: string) => {
    onChange?.(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      pick(options[active].value);
    } else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(controlBase, "flex h-11 items-center justify-between px-3.5 text-left", open && "border-primary ring-4 ring-ring/50")}
      >
        <span className={cn(!selected && "text-slate-400")}>{selected?.label ?? placeholder}</span>
        <ArrowDown2 size={16} className={cn("text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-60 w-full animate-scale-in overflow-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o.value)}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm",
                i === active && "bg-muted",
                o.value === value && "font-semibold text-primary"
              )}
            >
              {o.label}
              {o.value === value && <TickSquare size={16} variant="Bold" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Checkbox — native input (aksesibel) dengan tampilan kustom. */
export function Checkbox({
  label,
  description,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: string; description?: string }) {
  return (
    <label className={cn("group flex cursor-pointer items-start gap-3", className)}>
      <input type="checkbox" className="peer sr-only" {...props} />
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] border-2 border-slate-300 bg-surface transition-all peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-4 peer-focus-visible:ring-ring/50 [&>svg]:scale-0 peer-checked:[&>svg]:scale-100">
        <svg viewBox="0 0 24 24" className="size-3.5 text-white transition-transform" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
      {(label || description) && (
        <span>
          {label && <span className="block text-sm font-semibold text-foreground">{label}</span>}
          {description && <span className="block text-xs text-muted-foreground">{description}</span>}
        </span>
      )}
    </label>
  );
}

/** FileUpload — area drag & drop dengan daftar file terpilih. */
export function FileUpload({
  accept,
  multiple = true,
  hint = "PDF, PNG, JPG — maks. 5 MB",
  onFiles,
}: {
  accept?: string;
  multiple?: boolean;
  hint?: string;
  onFiles?: (files: File[]) => void;
}) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = multiple ? [...files, ...Array.from(list)] : Array.from(list).slice(0, 1);
    setFiles(next);
    onFiles?.(next);
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "focus-ring flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all",
          drag ? "border-primary bg-primary-soft/60" : "border-border bg-surface hover:border-slate-300 hover:bg-muted/50"
        )}
      >
        <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <DocumentUpload size={24} variant="Bulk" />
        </span>
        <p className="text-sm font-semibold text-foreground">
          <span className="text-primary">Klik untuk unggah</span> atau seret file ke sini
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => add(e.target.files)} />
      </div>
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <span className="truncate font-medium">{f.name}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                <button
                  onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                  aria-label={`Hapus ${f.name}`}
                  className="focus-ring rounded text-slate-400 hover:text-danger"
                >
                  <CloseCircle size={18} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
