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
			<DialogContent className="resora-admin-dialog" initialFocus={titleRef}>
				<div className="mb-6 space-y-2">
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
