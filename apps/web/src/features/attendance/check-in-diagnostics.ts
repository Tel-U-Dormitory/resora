import { scannerDiagnosticCode } from "./check-in-ui";

export type LocationDiagnosis = {
	code: string;
	accuracyMeters?: number;
	sampleAgeMs?: number;
	acquisitionMs?: number;
	distanceMeters?: number;
	radiusMeters?: number;
};

// Explicit projection: never copy coordinates, QR, identifiers or exception text.
export function locationDiagnosisText(diagnosis: LocationDiagnosis) {
	const code = [
		"IDLE",
		"GPS_ACQUIRING",
		"GPS_READY",
		"SUBMITTING",
		"SERVER_CONFIRMED",
	].includes(diagnosis.code)
		? diagnosis.code
		: scannerDiagnosticCode(diagnosis.code);
	const values: [string, number | undefined][] = [
		["Akurasi perangkat (m)", diagnosis.accuracyMeters],
		["Umur sampel (ms)", diagnosis.sampleAgeMs],
		["Pengambilan lokasi (ms)", diagnosis.acquisitionMs],
		["Jarak menurut server (m)", diagnosis.distanceMeters],
		["Radius event (m)", diagnosis.radiusMeters],
	];
	return [
		"Diagnosis lokasi RESORA",
		`Kode: ${code}`,
		...values
			.filter(
				([, value]) =>
					value !== undefined && Number.isFinite(value) && value >= 0,
			)
			.map(([label, value]) => `${label}: ${Math.round(value ?? 0)}`),
	].join("\n");
}
