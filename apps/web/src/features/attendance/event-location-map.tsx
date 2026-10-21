"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LocationPoint } from "./event-location-picker";

export default function EventLocationMap({
	centerLat,
	centerLng,
	radius,
	editable,
	onChange,
}: LocationPoint & {
	radius: number;
	editable: boolean;
	onChange: (point: LocationPoint) => void;
}) {
	const container = useRef<HTMLElement>(null);
	const [map, setMap] = useState<L.Map | null>(null);
	const [tileError, setTileError] = useState(false);
	useEffect(() => {
		if (!container.current) return;
		const instance = L.map(container.current, {
			scrollWheelZoom: true,
			touchZoom: true,
			zoomControl: false,
			minZoom: 0,
			maxZoom: 19,
		});
		const tiles = L.tileLayer(
			"https://tile.openstreetmap.org/{z}/{x}/{y}.png",
			{
				maxZoom: 19,
				attribution:
					'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			},
		).addTo(instance);
		tiles.on("tileerror", () => setTileError(true));
		setMap(instance);
		const observer = new ResizeObserver(() => instance.invalidateSize());
		observer.observe(container.current);
		return () => {
			observer.disconnect();
			instance.remove();
		};
	}, []);
	useEffect(() => {
		if (!map) return;
		const point: L.LatLngTuple = [centerLat, centerLng];
		map.setView(point, map.getZoom() ?? 18);
		const marker = L.marker(point, {
			draggable: editable,
			title: "Lokasi kegiatan",
			icon: L.divIcon({
				className: "",
				html: '<div style="width:24px;height:24px;background:#dc2626;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 1px 5px #0008"></div>',
				iconSize: [24, 24],
				iconAnchor: [12, 24],
			}),
		}).addTo(map);
		const circle = L.circle(point, {
			radius: Number.isFinite(radius) && radius > 0 ? radius : 0,
		}).addTo(map);
		const select = (latlng: L.LatLng) =>
			onChange({ centerLat: latlng.lat, centerLng: latlng.wrap().lng });
		const click = (event: L.LeafletMouseEvent) => {
			if (editable) select(event.latlng);
		};
		map.on("click", click);
		marker.on("dragend", () => select(marker.getLatLng()));
		return () => {
			map.off("click", click);
			marker.remove();
			circle.remove();
		};
	}, [map, centerLat, centerLng, radius, editable, onChange]);
	return (
		<div className="space-y-2">
			<fieldset
				className="grid grid-cols-2 gap-2"
				aria-label="Kontrol zoom peta"
			>
				<Button
					type="button"
					variant="outline"
					className="w-full"
					disabled={!map}
					aria-label="Perkecil peta"
					onClick={() => map?.zoomOut()}
				>
					− Perkecil
				</Button>
				<Button
					type="button"
					variant="outline"
					className="w-full"
					disabled={!map}
					aria-label="Perbesar peta"
					onClick={() => map?.zoomIn()}
				>
					+ Perbesar
				</Button>
				<span className="col-span-2 text-muted-foreground text-xs leading-relaxed">
					Gunakan tombol, scroll, atau cubit peta untuk mengatur zoom.
				</span>
			</fieldset>
			<section
				ref={container}
				aria-label="Peta lokasi kegiatan"
				aria-describedby="location-help"
				className="relative z-0 h-80 w-full rounded-lg border border-border"
			/>
			{tileError && (
				<p role="alert" className="text-destructive text-sm">
					Peta gagal dimuat. Periksa koneksi internet. Pilihan lokasi saat ini
					tetap tersimpan.
				</p>
			)}
			{editable && (
				<Button
					type="button"
					variant="primary"
					className="w-full whitespace-normal text-center"
					disabled={!map}
					onClick={() => {
						if (!map) return;
						const point = map.getCenter().wrap();
						onChange({ centerLat: point.lat, centerLng: point.lng });
					}}
				>
					Pasang pin di tengah peta
				</Button>
			)}
		</div>
	);
}
