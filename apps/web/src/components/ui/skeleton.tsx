import { Skeleton as ShadcnSkeleton } from "@resora/ui/components/skeleton";
import { cn } from "@/lib/utils";

/** Compatibility wrapper for the shared shadcn loading placeholder. */
export function Skeleton({ className }: { className?: string }) {
	return (
		<ShadcnSkeleton
			aria-hidden="true"
			className={cn("rounded-xl", className)}
		/>
	);
}
