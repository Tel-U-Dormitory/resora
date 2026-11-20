"use client";

import { Select } from "@resora/ui/components/select";
import { Textarea } from "@resora/ui/components/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { EventDetailView } from "./detail-model";

const labels = {
	INCLUDED: "Masukkan dalam penilaian",
	EXCLUDED: "Tidak dihitung dalam penilaian",
};

export function ScoringPanel({ view }: { view: EventDetailView }) {
	const { eventId, event, data, busy, activeAction, scoring, act, setError } =
		view;
	return (
		<Card>
			<CardHeader
				title="Penilaian Kehadiran"
				description="Event yang dimasukkan akan diperhitungkan dalam rekap poin kehadiran SR."
			/>
			<CardContent className="space-y-4">
				<p className="text-sm">
					Status:{" "}
					{event.attendanceScoringMode
						? labels[event.attendanceScoringMode]
						: "Belum diklasifikasikan"}
				</p>
				{data.canManageScoringMode && (
					<form
						key={`${eventId}:${event.attendanceScoringMode}`}
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							if (busy) return;
							const form = new FormData(e.currentTarget);
							const scoringMode = form.get("scoringMode");
							if (scoringMode !== "INCLUDED" && scoringMode !== "EXCLUDED") {
								setError("Pilih penilaian kehadiran terlebih dahulu.");
								return;
							}
							if (scoringMode === event.attendanceScoringMode) return;
							const reason = String(form.get("reason") ?? "").trim();
							if (!reason) {
								setError("Alasan perubahan penilaian wajib diisi.");
								return;
							}
							void act(
								"scoring",
								"Penilaian kehadiran berhasil disimpan.",
								() => scoring.mutateAsync({ eventId, scoringMode, reason }),
							);
						}}
					>
						<label
							htmlFor="attendance-scoring-mode"
							className="block space-y-2 text-sm"
						>
							Penilaian kehadiran
							<Select
								id="attendance-scoring-mode"
								name="scoringMode"
								required
								disabled={busy}
								defaultValue={event.attendanceScoringMode ?? ""}
							>
								<option value="" disabled>
									Belum diklasifikasikan
								</option>
								{Object.entries(labels).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</Select>
						</label>
						<label
							htmlFor="attendance-scoring-reason"
							className="block space-y-2 text-sm"
						>
							Alasan perubahan
							<Textarea
								id="attendance-scoring-reason"
								name="reason"
								rows={3}
								maxLength={2000}
								required
								disabled={busy}
							/>
						</label>
						<Button
							type="submit"
							disabled={busy}
							loading={activeAction === "scoring"}
						>
							Simpan penilaian
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	);
}
