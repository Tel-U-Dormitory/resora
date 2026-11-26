"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@resora/ui/components/dialog";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function useEventConfirmation() {
	const [request, setRequest] = useState<{
		message: string;
		label: string;
	} | null>(null);
	const resolver = useRef<((confirmed: boolean) => void) | null>(null);
	const title = useRef<HTMLHeadingElement>(null);
	useEffect(
		() => () => {
			resolver.current?.(false);
			resolver.current = null;
		},
		[],
	);
	const finish = (confirmed: boolean) => {
		const resolve = resolver.current;
		resolver.current = null;
		setRequest(null);
		resolve?.(confirmed);
	};
	const confirm = (message: string, label: string) => {
		if (resolver.current) return Promise.resolve(false);
		return new Promise<boolean>((resolve) => {
			resolver.current = resolve;
			setRequest({ message, label });
		});
	};
	const confirmation = request && (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) finish(false);
			}}
		>
			<DialogContent
				initialFocus={title}
				className="resora-events-dialog space-y-4"
				onFocusCapture={(event) => {
					if (event.target instanceof HTMLElement)
						event.target.scrollIntoView({
							block: "nearest",
							inline: "nearest",
						});
				}}
			>
				<DialogTitle
					ref={title}
					tabIndex={-1}
					className="font-semibold text-xl outline-none"
				>
					{request.label}
				</DialogTitle>
				<DialogDescription className="text-sm">
					{request.message}
				</DialogDescription>
				<div className="flex flex-wrap justify-end gap-2">
					<Button variant="outline" onClick={() => finish(false)}>
						Batal
					</Button>
					<Button variant="danger" onClick={() => finish(true)}>
						{request.label}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
	return { confirm, confirmation };
}
