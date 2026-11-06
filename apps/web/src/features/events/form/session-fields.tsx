"use client";

import { Input } from "@resora/ui/components/input";

import { MapPin } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

import { EventLocationPicker } from "../event-location-picker";

import { type DraftEditorView, fieldClass } from "./form-model";
export function SessionFields({ view }: { view: DraftEditorView }) {
	const { draft, setDraft, setLocation, saving, invalidFieldId, session } =
		view;
	return (
		<Card>
			<div className="border-border border-b p-5">
				<h2 className="flex items-center gap-2 font-semibold text-base">
					<MapPin className="size-4 text-muted-foreground" aria-hidden="true" />{" "}
					Lokasi & kehadiran
				</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					Tentukan lokasi kegiatan dan area check-in peserta.
				</p>
			</div>
			<CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<div className="sm:col-span-2 lg:col-span-3">
					<EventLocationPicker
						centerLat={session.centerLat}
						centerLng={session.centerLng}
						radius={session.geofenceRadiusM ?? 20}
						onChange={setLocation}
						disabled={saving}
					/>
				</div>
				<label
					htmlFor="event-geofenceRadiusM"
					className="block space-y-2 sm:col-span-2 lg:col-span-3"
				>
					Radius check-in (meter)
					<Input
						id="event-geofenceRadiusM"
						aria-invalid={
							invalidFieldId === "event-geofenceRadiusM" || undefined
						}
						required
						type="number"
						step={1}
						min={1}
						max={2147483647}
						className="max-w-xs"
						value={session.geofenceRadiusM ?? ""}
						onChange={(event) =>
							setDraft({
								...draft,
								session: {
									...session,
									geofenceRadiusM: Number(event.target.value),
								},
							})
						}
					/>
					<span className="block text-muted-foreground text-xs">
						Peserta harus berada dalam area ini untuk check-in. Lokasi tetap
						diperiksa oleh sistem.
					</span>
				</label>
				<details className="rounded-xl border border-border p-4 sm:col-span-2 lg:col-span-3">
					<summary className="focus-ring cursor-pointer rounded-md font-medium text-sm">
						Pengaturan kehadiran
						<span className="mt-1 block text-muted-foreground text-xs">
							Toleransi {session.lateGraceMinutes ?? 15} menit · QR berlaku{" "}
							{session.qrTtlMinutes ?? 360} menit
						</span>
					</summary>
					<div className="mt-4 grid gap-4 sm:grid-cols-2">
						{(
							[
								["lateGraceMinutes", "Toleransi telat (menit)", 0, 2147483647],
								["qrTtlMinutes", "Masa berlaku QR (menit)", 1, 2147483647],
							] as const
						).map(([key, label, min, max]) => (
							<label
								key={key}
								htmlFor={`event-${key}`}
								className="block min-w-0 font-medium text-sm"
							>
								{label}
								<Input
									id={`event-${key}`}
									aria-invalid={invalidFieldId === `event-${key}` || undefined}
									required
									type="number"
									step={1}
									min={min}
									max={max}
									className={fieldClass}
									value={session[key] ?? ""}
									onChange={(e) =>
										setDraft({
											...draft,
											session: {
												...session,
												[key]: Number(e.target.value),
											},
										})
									}
								/>
							</label>
						))}
					</div>
				</details>
			</CardContent>
		</Card>
	);
}
