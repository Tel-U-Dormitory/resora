import { cn } from "@/lib/utils";

/** Skeleton — placeholder shimmer animasi saat data dimuat. */
export function Skeleton({ className }: { className?: string }) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"animate-shimmer rounded-md bg-[length:200%_100%] bg-[linear-gradient(90deg,var(--muted)_0%,var(--border)_50%,var(--muted)_100%)]",
				className,
			)}
		/>
	);
}
