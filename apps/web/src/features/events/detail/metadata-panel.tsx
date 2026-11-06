"use client";
import { Input } from "@resora/ui/components/input";

import { Textarea } from "@resora/ui/components/textarea";

import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import type { EventDetailView } from "./detail-model";
export function MetadataPanel({ view }: { view: EventDetailView }) {
	const { eventId, activeAction, metadata, act, event, busy, data } = view;
	return (
		<Card>
			<CardHeader
				title="Informasi event"
				icon={<CalendarDays size={20} aria-hidden="true" />}
				description={
					data.advancedEditMode
						? "Perubahan SUPERADMIN mengikuti status sesi dan kehadiran terkini."
						: "Hanya judul dan deskripsi yang dapat diubah setelah publikasi."
				}
			/>
			<CardContent>
				{data.advancedEditMode ? (
					<p className="text-muted-foreground text-sm">
						Gunakan Edit event (SUPERADMIN) untuk perubahan administratif dengan
						alasan dan audit.
					</p>
				) : (
					<form
						key={event.updatedAt}
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							const data = new FormData(e.currentTarget);
							void act("metadata", "Perubahan event berhasil disimpan.", () =>
								metadata.mutateAsync({
									eventId,
									title: String(data.get("title") ?? ""),
									description: String(data.get("description") ?? ""),
								}),
							);
						}}
					>
						<label htmlFor="metadata-title" className="block space-y-2 text-sm">
							Judul
							<Input
								id="metadata-title"
								name="title"
								disabled={busy}
								required
								maxLength={200}
								defaultValue={event.title}
							/>
						</label>
						<label
							htmlFor="metadata-description"
							className="block space-y-2 text-sm"
						>
							Deskripsi
							<Textarea
								id="metadata-description"
								name="description"
								disabled={busy}
								rows={4}
								maxLength={5000}
								defaultValue={event.description}
							/>
						</label>
						<Button
							type="submit"
							disabled={busy}
							loading={activeAction === "metadata"}
						>
							{activeAction === "metadata"
								? "Menyimpan perubahan…"
								: "Simpan perubahan"}
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	);
}
