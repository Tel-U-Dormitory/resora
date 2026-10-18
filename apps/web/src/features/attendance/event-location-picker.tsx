"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

export const DORM_HALL = { centerLat: -6.9712891, centerLng: 107.628339 };

const LocationMap = dynamic(() => import("./event-location-map"), {
	ssr: false,
	loading: () => <p role="status">Memuat peta…</p>,
});

export type LocationPoint = { centerLat: number; centerLng: number };

export function EventLocationPicker({
	centerLat,
	centerLng,
	radius,
	onChange,
}: LocationPoint & {
	radius: number;
	onChange: (point: LocationPoint) => void;
}) {
	const [custom, setCustom] = useState(
		centerLat !== DORM_HALL.centerLat || centerLng !== DORM_HALL.centerLng,
	);
	return (
		<div className="space-y-3">
			<fieldset className="space-y-2">
				<legend className="mb-2 font-medium text-sm">Lokasi kegiatan</legend>
				<div className="flex flex-wrap gap-3">
					{[false, true].map((value) => (
						<label
							key={String(value)}
							className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary-soft"
						>
							<input
								type="radio"
								name="event-location"
								checked={custom === value}
								onChange={() => {
									setCustom(value);
									if (!value) onChange({ ...DORM_HALL });
								}}
							/>
							{value ? "Pilih lokasi lain di peta" : "Dorm Hall"}
						</label>
					))}
				</div>
			</fieldset>
			<p id="location-help" className="text-muted-foreground text-sm">
				{custom
					? "Klik atau ketuk peta untuk memasang pin, atau geser pin ke lokasi kegiatan. Dengan keyboard, geser peta menggunakan tombol panah lalu pilih titik tengah."
					: "Dorm Hall dipilih sebagai lokasi kegiatan. Pilih lokasi lain untuk memindahkan pin."}
			</p>
			<LocationMap
				centerLat={centerLat}
				centerLng={centerLng}
				radius={radius}
				editable={custom}
				onChange={onChange}
			/>
			<p role="status" className="text-muted-foreground text-sm">
				{custom ? "Titik terpilih" : "Dorm Hall"}: {centerLat.toFixed(7)},{" "}
				{centerLng.toFixed(7)}
			</p>
		</div>
	);
}
