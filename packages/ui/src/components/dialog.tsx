"use client";

// shadcn/ui Base UI composition, adapted to RESORA's existing tokens.
// https://ui.shadcn.com/docs/components/base/dialog
import { Dialog as Primitive } from "@base-ui/react/dialog";
import { cn } from "@resora/ui/lib/utils";
import type { ComponentProps } from "react";

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({
	className,
	...props
}: ComponentProps<typeof Primitive.Popup>) {
	return (
		<Primitive.Portal>
			<Primitive.Backdrop className="fixed inset-0 z-50 bg-black/50" />
			<Primitive.Popup
				className={cn(
					"fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-xl outline-none",
					className,
				)}
				{...props}
			/>
		</Primitive.Portal>
	);
}
