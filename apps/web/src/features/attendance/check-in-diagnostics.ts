import { scannerDiagnosticCode } from "./check-in-ui";

export type LocationDiagnosis = {
	code: string;
	accuracyMeters?: number;
	sampleAgeMs?: number;
	acquisitionMs?: number;
	distanceMeters?: number;
	radiusMeters?: number;
};
const devices = [
	"iPhone / iOS",
	"iPad / iPadOS",
	"Android",
	"Windows",
	"macOS",
	"Linux",
] as const;
const browsers = ["Edge", "Firefox", "Chrome/Chromium", "Safari"] as const;
export type DiagnosisEnvironment = {
	device?: (typeof devices)[number];
	browser?: (typeof browsers)[number];
	permission?: PermissionState | "unavailable";
	timestamp?: number;
};

// Coarse best-effort labels only. Never return or persist the user-agent itself.
export function diagnosisEnvironment(userAgent: string): DiagnosisEnvironment {
	const device = /iPhone/i.test(userAgent)
		? devices[0]
		: /iPad/i.test(userAgent)
			? devices[1]
			: /Android/i.test(userAgent)
				? devices[2]
				: /Windows/i.test(userAgent)
					? devices[3]
					: /Macintosh/i.test(userAgent)
						? devices[4]
						: /Linux/i.test(userAgent)
							? devices[5]
							: undefined;
	const browser = /Edg\//i.test(userAgent)
		? browsers[0]
		: /Firefox\//i.test(userAgent)
			? browsers[1]
			: /Chrome\/|CriOS\//i.test(userAgent)
				? browsers[2]
				: /Safari\//i.test(userAgent)
					? browsers[3]
					: undefined;
	return { device, browser };
}
const unavailable = "Tidak tersedia";
const timestampFormatter = new Intl.DateTimeFormat("id-ID", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
	timeZone: "Asia/Jakarta",
});
const validNumber = (value: number | undefined): value is number =>
	typeof value === "number" && Number.isFinite(value) && value >= 0;

// Explicit projection: never copy coordinates, QR, identifiers or exception text.
export function locationDiagnosisText(
	diagnosis: LocationDiagnosis,
	environment: DiagnosisEnvironment = {},
) {
	const code = [
		"IDLE",
		"GPS_ACQUIRING",
		"GPS_READY",
		"SUBMITTING",
		"SERVER_CONFIRMED",
	].includes(diagnosis.code)
		? diagnosis.code
		: scannerDiagnosticCode(diagnosis.code);
	const date = new Date(environment.timestamp ?? Number.NaN);
	const time =
		validNumber(environment.timestamp) && Number.isFinite(date.getTime())
			? `${timestampFormatter.format(date).replace(",", "").replace(".", ":")} WIB`
			: unavailable;
	const values: [string, number | undefined, string][] = [
		["Akurasi GPS", diagnosis.accuracyMeters, "m"],
		["Umur sampel", diagnosis.sampleAgeMs, "ms"],
		["Durasi pengambilan", diagnosis.acquisitionMs, "ms"],
		["Jarak server", diagnosis.distanceMeters, "m"],
		["Radius event", diagnosis.radiusMeters, "m"],
	];
	const difference =
		validNumber(diagnosis.distanceMeters) && validNumber(diagnosis.radiusMeters)
			? diagnosis.distanceMeters - diagnosis.radiusMeters
			: undefined;
	return [
		"Diagnosis lokasi RESORA",
		`Waktu: ${time}`,
		`Perangkat: ${devices.includes(environment.device as (typeof devices)[number]) ? environment.device : unavailable}`,
		`Browser: ${browsers.includes(environment.browser as (typeof browsers)[number]) ? environment.browser : unavailable}`,
		`Kode: ${code}`,
		`Permission: ${["granted", "denied", "prompt"].includes(environment.permission ?? "") ? environment.permission : unavailable}`,
		...values.map(
			([label, value, unit]) =>
				`${label}: ${validNumber(value) ? `${value} ${unit}` : unavailable}`,
		),
		`Selisih batas: ${difference === undefined ? unavailable : `${difference > 0 ? "+" : ""}${difference} m`}`,
		// Contracts remain TBD in interaction-spec §6; do not invent counters or IDs.
		`Percobaan: ${unavailable}`,
		`ID diagnosis: ${unavailable}`,
		"Koordinat presisi: tidak disertakan.",
	].join("\n");
}
