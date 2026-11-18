export type AttendanceLocationDiagnostic = {
	code: "GPS_INACCURATE" | "OUTSIDE_GEOFENCE";
	distanceMeters: number;
	radiusMeters: number;
	accuracyMeters: number;
};

// Only constructed after live eligibility, invitation and QR verification.
export class AttendanceLocationError extends Error {
	constructor(readonly diagnostic: AttendanceLocationDiagnostic) {
		super(diagnostic.code);
	}
}

export function attendanceLocationDiagnostic(cause: unknown) {
	if (!(cause instanceof AttendanceLocationError)) return null;
	const { code, distanceMeters, radiusMeters, accuracyMeters } =
		cause.diagnostic;
	if (
		(code !== "GPS_INACCURATE" && code !== "OUTSIDE_GEOFENCE") ||
		!Number.isFinite(distanceMeters) ||
		distanceMeters < 0 ||
		!Number.isFinite(radiusMeters) ||
		radiusMeters <= 0 ||
		!Number.isFinite(accuracyMeters) ||
		accuracyMeters <= 0
	)
		return null;
	return {
		code,
		distanceMeters: Math.ceil(distanceMeters),
		radiusMeters,
		accuracyMeters: Math.ceil(accuracyMeters),
	};
}
