import { cn } from "@resora/ui/lib/utils";
import type * as React from "react";

function Select({ className, ...props }: React.ComponentProps<"select">) {
	return (
		<select
			data-slot="select"
			className={cn(
				"focus-ring block min-h-11 w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm transition-colors hover:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive dark:bg-input/30",
				className,
			)}
			{...props}
		/>
	);
}

export { Select };
