"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { Button } from "./button";

export function ActionDialog({
	open,
	onOpenChange,
	title,
	children,
	onRetry,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	children: ReactNode;
	onRetry?: () => void;
}) {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup className="fixed z-50 max-h-[calc(100dvh-2rem)] overflow-y-auto border border-border bg-popover p-6 text-popover-foreground shadow-xl max-[1199px]:inset-x-0 max-[1199px]:bottom-0 max-[1199px]:w-full max-[1199px]:rounded-t-[24px] max-[1199px]:rounded-b-none min-[1200px]:top-1/2 min-[1200px]:left-1/2 min-[1200px]:w-[calc(100%_-_2rem)] min-[1200px]:max-w-md min-[1200px]:-translate-x-1/2 min-[1200px]:-translate-y-1/2 min-[1200px]:rounded-[24px]">
					<Dialog.Title className="mb-3 font-semibold text-lg">
						{title}
					</Dialog.Title>
					<Dialog.Description render={<div />} className="space-y-3 text-sm">
						{children}
					</Dialog.Description>
					<div className="mt-6 flex justify-end gap-2">
						<Dialog.Close
							render={<Button variant="outline" className="rounded-lg" />}
						>
							{onRetry ? "Tutup" : "Mengerti"}
						</Dialog.Close>
						{onRetry && (
							<Button onClick={onRetry} className="rounded-lg">
								Coba lagi
							</Button>
						)}
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
