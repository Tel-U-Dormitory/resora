import { Card as ShadcnCard } from "@resora/ui/components/card";
import type * as React from "react";
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
		<ShadcnCard
			data-resora-card=""
			className={cn(
				"gap-0 overflow-visible rounded-xl border border-border bg-surface py-0 text-base shadow-xs ring-0",
				interactive &&
					"transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
				className,
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
	title?: string;
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
		<div
			data-resora-card-header=""
			className={cn(
				"flex flex-col items-start justify-between gap-4 p-5 sm:flex-row",
				className,
			)}
			{...props}
		>
			<div className="flex min-w-0 items-start gap-3">
				{icon && (
					<span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
						{icon}
					</span>
				)}
				<div className="min-w-0">
					{title && (
						<h3 className="font-bold text-base text-foreground tracking-tight">
							{title}
						</h3>
					)}
					{description && (
						<p className="mt-0.5 text-muted-foreground text-sm">
							{description}
						</p>
					)}
				</div>
			</div>
			{action}
		</div>
	);
}

export function CardContent({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			data-resora-card-content=""
			className={cn("min-w-0 p-5", className)}
			{...props}
		/>
	);
}

export function CardFooter({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"flex items-center justify-end gap-2 border-border border-t px-5 py-3.5",
				className,
			)}
			{...props}
		/>
	);
}
