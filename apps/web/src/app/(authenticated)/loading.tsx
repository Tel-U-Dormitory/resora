import { Skeleton } from "@resora/ui/components/skeleton";

export default function AuthenticatedLoading() {
	return (
		<div
			className="resora-page space-y-6 py-2"
			aria-busy="true"
			aria-live="polite"
		>
			<div className="space-y-2">
				<Skeleton className="h-4 w-28 rounded-md" />
				<Skeleton className="h-8 w-56 rounded-xl" />
			</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<Skeleton className="h-28 rounded-2xl" />
				<Skeleton className="h-28 rounded-2xl" />
				<Skeleton className="hidden h-28 rounded-2xl lg:block" />
			</div>
			<Skeleton className="h-64 w-full rounded-2xl" />
		</div>
	);
}
