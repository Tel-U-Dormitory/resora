"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@resora/ui/lib/utils";

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("min-w-0", className)}
			{...props}
		/>
	);
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				"resora-tabs-scroll inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface-subtle p-1",
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsPrimitive.Tab
			data-slot="tabs-trigger"
			className={cn(
				"focus-ring inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 font-semibold text-text-secondary text-xs transition-colors hover:bg-surface/70 hover:text-foreground aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:shadow-2xs aria-selected:hover:bg-primary aria-selected:hover:text-primary-foreground data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:hover:bg-transparent data-disabled:hover:text-text-secondary sm:text-sm",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
	return (
		<TabsPrimitive.Panel
			data-slot="tabs-content"
			className={cn("min-w-0 outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
