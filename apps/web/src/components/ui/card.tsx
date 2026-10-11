import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card — kontainer konten dasar (composable).
 *
 * @example
 * <Card>
 *   <CardHeader title="Judul" description="Deskripsi singkat" action={<Button size="sm">Aksi</Button>} />
 *   <CardContent>...</CardContent>
 *   <CardFooter>...</CardFooter>
 * </Card>
 */
export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-xs",
        interactive && "transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon,
  className,
  children,
  ...props
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  if (children) {
    return (
      <div className={cn("p-5 pb-0", className)} {...props}>
        {children}
      </div>
    );
  }
  return (
    <div className={cn("flex items-start justify-between gap-4 p-5 pb-0", className)} {...props}>
      <div className="flex items-start gap-3">
        {icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            {icon}
          </span>
        )}
        <div>
          {title && <h3 className="text-base font-bold tracking-tight text-foreground">{title}</h3>}
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 border-t border-border px-5 py-3.5", className)}
      {...props}
    />
  );
}
