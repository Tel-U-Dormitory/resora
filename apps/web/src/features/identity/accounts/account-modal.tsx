"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@resora/ui/components/dialog";
import { type ReactNode, useRef } from "react";
import { Button } from "@/components/ui/button";

export function AccountModal({
	title,
	description,
	busy,
	onClose,
	children,
}: {
	title: string;
	description: string;
	busy?: boolean;
	onClose: () => void;
	children: ReactNode;
}) {
	const titleRef = useRef<HTMLHeadingElement>(null);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent
				className="resora-admin-dialog resora-administration-dialog"
				initialFocus={titleRef}
			>
				<div className="mb-6 flex items-start justify-between gap-3">
					<div className="space-y-2">
						<DialogTitle
							ref={titleRef}
							tabIndex={-1}
							className="font-semibold text-xl outline-none"
						>
							{title}
						</DialogTitle>
						<DialogDescription className="text-muted-foreground text-sm">
							{description}
						</DialogDescription>
					</div>
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label="Tutup dialog"
						disabled={busy}
						onClick={onClose}
						className="size-10 shrink-0 rounded-full"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.75"
							className="size-4"
						>
							<path d="m4 4 8 8M12 4l-8 8" />
						</svg>
					</Button>
				</div>
				{children}
				<div className="mt-4 flex justify-end">
					<Button variant="outline" disabled={busy} onClick={onClose}>
						Tutup
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
