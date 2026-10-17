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
				<Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-xl">
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
