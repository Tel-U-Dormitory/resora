export const MAX_GPS_ACCURACY_M = 40;
export type CheckInLocation = {
	latitude: number;
	longitude: number;
	accuracyMeters: number;
};
export type TimingClass = "EARLY" | "ON_TIME" | "LATE";

export function validLocation(location: CheckInLocation) {
	return (
		Number.isFinite(location.latitude) &&
		location.latitude >= -90 &&
		location.latitude <= 90 &&
		Number.isFinite(location.longitude) &&
		location.longitude >= -180 &&
		location.longitude <= 180 &&
		Number.isFinite(location.accuracyMeters) &&
		location.accuracyMeters > 0
	);
}
export function haversineMeters(
	from: { latitude: number; longitude: number },
	to: { latitude: number; longitude: number },
) {
	const radians = (value: number) => (value * Math.PI) / 180;
	const latDelta = radians(to.latitude - from.latitude);
	const lngDelta = radians(to.longitude - from.longitude);
	const a =
		Math.sin(latDelta / 2) ** 2 +
		Math.cos(radians(from.latitude)) *
			Math.cos(radians(to.latitude)) *
			Math.sin(lngDelta / 2) ** 2;
	return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
export function locationFailure(
	location: CheckInLocation,
	center: { latitude: number; longitude: number },
	radiusM: number,
) {
	if (!validLocation(location)) return "INVALID_LOCATION";
	if (location.accuracyMeters > MAX_GPS_ACCURACY_M) return "GPS_INACCURATE";
	if (haversineMeters(center, location) > radiusM) return "OUTSIDE_GEOFENCE";
	return null;
}
export function classifyTiming(
	attendanceAt: Date,
	startsAt: Date,
	graceMinutes: number,
): TimingClass {
	if (attendanceAt < startsAt) return "EARLY";
	return attendanceAt.getTime() <= startsAt.getTime() + graceMinutes * 60_000
		? "ON_TIME"
		: "LATE";
}
