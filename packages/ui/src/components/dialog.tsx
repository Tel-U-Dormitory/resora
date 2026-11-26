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
			<Primitive.Backdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
			<Primitive.Popup
				className={cn(
					"fixed z-50 max-h-[90dvh] overflow-y-auto border border-border bg-popover p-6 text-popover-foreground shadow-xl outline-none max-[1199px]:inset-x-0 max-[1199px]:bottom-0 max-[1199px]:w-full max-[1199px]:rounded-t-[24px] max-[1199px]:rounded-b-none min-[1200px]:top-1/2 min-[1200px]:left-1/2 min-[1200px]:w-[calc(100%_-_2rem)] min-[1200px]:max-w-lg min-[1200px]:-translate-x-1/2 min-[1200px]:-translate-y-1/2 min-[1200px]:rounded-[24px]",
					className,
				)}
				{...props}
			/>
		</Primitive.Portal>
	);
}
