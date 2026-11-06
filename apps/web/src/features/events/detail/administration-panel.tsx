"use client";

import { Select } from "@resora/ui/components/select";
import { Textarea } from "@resora/ui/components/textarea";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import {
	type AdministrativeAction,
	administrativeLabels,
	type EventDetailView,
} from "./detail-model";
export function AdministrationPanel({ view }: { view: EventDetailView }) {
	const {
		eventId,
		activeAction,
		visibility,
		deleteDraft,
		administrativeAction,
		setAdministrativeAction,
		administrativeReason,
		setAdministrativeReason,
		setError,
		act,
		event,
		administrativeOptions,
		busy,
	} = view;
	return (
		<Card>
			<CardHeader
				title="Administrasi event"
				description="Tindakan SUPERADMIN memerlukan alasan dan konfirmasi, serta dicatat dalam audit."
			/>
			<CardContent className="space-y-4">
				{administrativeOptions.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{event.status === "DRAFT"
							? "Draft memiliki sesi yang pernah digunakan atau referensi operasional/audit sehingga tidak dapat dihapus."
							: "Perubahan visibilitas tidak tersedia pada kondisi sesi ini. Sesi aktif tidak dapat disembunyikan."}
					</p>
				) : (
					<form
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							if (
								busy ||
								!administrativeAction ||
								!administrativeOptions.includes(administrativeAction)
							)
								return;
							if (!administrativeReason.trim()) {
								setError("Alasan administratif wajib diisi.");
								return;
							}
							const deleting = administrativeAction === "DELETE_DRAFT";
							if (
								!window.confirm(
									deleting
										? `Hapus draft "${event.title}" secara permanen? Tindakan ini tidak dapat dibatalkan dan bukti audit akan tetap disimpan.`
										: `${administrativeLabels[administrativeAction]} "${event.title}"? Tindakan ini tidak mengubah status event, sesi, QR, atau catatan kehadiran.`,
								)
							)
								return;
							void act(
								deleting ? "deleteDraft" : "visibility",
								deleting
									? "Draft berhasil dihapus. Mengalihkan ke kelola event…"
									: "Visibilitas event berhasil diperbarui.",
								async () => {
									if (administrativeAction === "DELETE_DRAFT")
										await deleteDraft.mutateAsync({
											eventId,
											reason: administrativeReason,
										});
									else
										await visibility.mutateAsync({
											eventId,
											action: administrativeAction,
											reason: administrativeReason,
										});
									setAdministrativeAction("");
									setAdministrativeReason("");
								},
							);
						}}
					>
						<label
							htmlFor="administrative-action"
							className="block space-y-2 text-sm"
						>
							Tindakan
							<Select
								id="administrative-action"
								required
								disabled={busy}
								value={administrativeAction}
								onChange={(e) =>
									setAdministrativeAction(
										e.target.value as AdministrativeAction | "",
									)
								}
							>
								<option value="">Pilih tindakan</option>
								{administrativeOptions.map((action) => (
									<option key={action} value={action}>
										{administrativeLabels[action]}
									</option>
								))}
							</Select>
						</label>
						<label
							htmlFor="administrative-reason"
							className="block space-y-2 text-sm"
						>
							Alasan administratif
							<Textarea
								id="administrative-reason"
								required
								maxLength={2000}
								disabled={busy}
								value={administrativeReason}
								onChange={(e) => setAdministrativeReason(e.target.value)}
							/>
						</label>
						<Button
							type="submit"
							variant={
								administrativeAction === "DELETE_DRAFT" ? "danger" : "outline"
							}
							disabled={busy || !administrativeAction}
							loading={
								activeAction === "visibility" || activeAction === "deleteDraft"
							}
						>
							{activeAction === "visibility" || activeAction === "deleteDraft"
								? "Memproses…"
								: "Konfirmasi tindakan"}
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	);
}
