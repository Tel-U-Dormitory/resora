"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@resora/ui/components/dialog";
import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Textarea } from "@resora/ui/components/textarea";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { queryClient, trpc } from "@/utils/trpc";
import { committeeError } from "./committee-ui";

export function CommitteeFields({
	name = "",
	description = "",
}: {
	name?: string;
	description?: string;
}) {
	return (
		<>
			<div className="space-y-2">
				<Label htmlFor="committee-name">Nama kepanitiaan</Label>
				<Input
					id="committee-name"
					name="name"
					defaultValue={name}
					required
					maxLength={150}
					pattern=".*\S.*"
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="committee-description">Deskripsi</Label>
				<Textarea
					id="committee-description"
					name="description"
					defaultValue={description}
					maxLength={2000}
					rows={4}
				/>
			</div>
		</>
	);
}

// Shared only by committee forms/confirmations; pending mutations keep the dialog open.
export function CommitteeDialog({
	title,
	description,
	children,
	submitLabel = "Simpan",
	onSubmit,
	onClose,
	onSuccess,
}: {
	title: string;
	description: string;
	children?: ReactNode | ((busy: boolean) => ReactNode);
	submitLabel?: string;
	onSubmit: (fields: FormData) => Promise<unknown>;
	onClose: () => void;
	onSuccess?: () => void;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const submitting = useRef(false);
	const titleRef = useRef<HTMLHeadingElement>(null);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !submitting.current) onClose();
			}}
		>
			<DialogContent className="resora-admin-dialog" initialFocus={titleRef}>
				<DialogTitle
					ref={titleRef}
					tabIndex={-1}
					className="font-semibold text-xl outline-none"
				>
					{title}
				</DialogTitle>
				<DialogDescription className="mt-2 text-muted-foreground text-sm">
					{description}
				</DialogDescription>
				<form
					className="mt-5 space-y-4"
					onSubmit={async (event) => {
						event.preventDefault();
						if (submitting.current) return;
						const fields = new FormData(event.currentTarget);
						submitting.current = true;
						setBusy(true);
						setError("");
						try {
							await onSubmit(fields);
						} catch (failure) {
							setError(committeeError(failure));
							submitting.current = false;
							setBusy(false);
							return;
						}
						// A completed write remains successful even if refreshing a query fails.
						await queryClient
							.invalidateQueries({
								queryKey: trpc.committee.pathKey(),
								refetchType: onSuccess ? "none" : "active",
							})
							.catch(() => undefined);
						toast.success("Perubahan kepanitiaan berhasil disimpan.");
						onClose();
						onSuccess?.();
					}}
				>
					<fieldset disabled={busy} className="min-w-0 space-y-4">
						{typeof children === "function" ? children(busy) : children}
					</fieldset>
					{error && (
						<p role="alert" className="text-destructive text-sm">
							{error}
						</p>
					)}
					<div className="flex flex-wrap justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={busy}
							onClick={onClose}
						>
							Batal
						</Button>
						<Button type="submit" disabled={busy} loading={busy}>
							{busy ? "Menyimpan perubahan…" : submitLabel}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
