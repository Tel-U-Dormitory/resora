// Keep this local browser precheck aligned with check-in-policy.ts; the server
// remains authoritative for accuracy, geofence and QR validity.
export const MAX_GPS_ACCURACY_M = 40;
export const GPS_WINDOW_MS = 20_000;
export const GPS_FRESH_MS = 10_000;
export const GPS_SETTLE_MS = 3_000;
const GPS_EARLY_ACCURACY_M = 10;

export function freshPosition(position: GeolocationPosition, now = Date.now()) {
	const { latitude, longitude, accuracy } = position.coords;
	return (
		Number.isFinite(position.timestamp) &&
		position.timestamp <= now &&
		now - position.timestamp <= GPS_FRESH_MS &&
		Number.isFinite(latitude) &&
		latitude >= -90 &&
		latitude <= 90 &&
		Number.isFinite(longitude) &&
		longitude >= -180 &&
		longitude <= 180 &&
		Number.isFinite(accuracy) &&
		accuracy > 0 &&
		accuracy <= MAX_GPS_ACCURACY_M
	);
}

type LocationVisibility = Pick<
	Document,
	"hidden" | "addEventListener" | "removeEventListener"
>;

export function acquireLocation(
	geolocation: Geolocation | undefined,
	signal: AbortSignal,
	visibility?: LocationVisibility,
	onReading?: (reading: {
		accuracyMeters: number;
		sampleAgeMs: number;
	}) => void,
) {
	return new Promise<GeolocationPosition>((resolve, reject) => {
		if (signal.aborted) return reject(new Error("GPS_CANCELLED"));
		if (!geolocation) return reject(new Error("GPS_UNAVAILABLE"));
		let finished = false;
		let watch: number | undefined;
		let generation = 0;
		let resumes = 0;
		let paused = visibility?.hidden ?? false;
		let best: GeolocationPosition | undefined;
		let settle: ReturnType<typeof setTimeout> | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let failure = "GPS_TIMEOUT";
		const suspend = () => {
			generation++;
			if (timer !== undefined) clearTimeout(timer);
			if (settle !== undefined) clearTimeout(settle);
			if (watch !== undefined) geolocation.clearWatch(watch);
			timer = settle = watch = undefined;
			best = undefined;
		};
		const finish = (position?: GeolocationPosition, code = failure) => {
			if (finished) return;
			finished = true;
			suspend();
			signal.removeEventListener("abort", cancel);
			visibility?.removeEventListener("visibilitychange", onVisibility);
			if (position) resolve(position);
			else reject(new Error(code));
		};
		const cancel = () => finish(undefined, "GPS_CANCELLED");
		const start = () => {
			const attempt = ++generation;
			failure = "GPS_TIMEOUT";
			const finishBest = () => {
				if (finished || attempt !== generation) return;
				if (best && freshPosition(best)) finish(best);
				settle = undefined;
			};
			timer = setTimeout(() => {
				if (finished || attempt !== generation) return;
				if (best && freshPosition(best)) finish(best);
				else finish();
			}, GPS_WINDOW_MS);
			try {
				const id = geolocation.watchPosition(
					(position) => {
						if (finished || attempt !== generation || visibility?.hidden)
							return;
						if (
							Number.isFinite(position.coords.accuracy) &&
							position.coords.accuracy > 0 &&
							Number.isFinite(position.timestamp) &&
							position.timestamp >= 0 &&
							position.timestamp <= Date.now()
						)
							onReading?.({
								accuracyMeters: position.coords.accuracy,
								sampleAgeMs: Date.now() - position.timestamp,
							});
						if (!freshPosition(position)) {
							failure = "GPS_INACCURATE";
							return;
						}
						// Prefer accuracy, never proximity to the event or an averaged coordinate.
						if (
							!best ||
							!freshPosition(best) ||
							position.coords.accuracy <= best.coords.accuracy
						)
							best = position;
						if (best.coords.accuracy <= GPS_EARLY_ACCURACY_M) finish(best);
						else if (settle === undefined)
							settle = setTimeout(finishBest, GPS_SETTLE_MS);
					},
					(error) => {
						if (finished || attempt !== generation || visibility?.hidden)
							return;
						if (error.code === 1) finish(undefined, "GPS_DENIED");
						else if (failure !== "GPS_INACCURATE")
							failure = error.code === 3 ? "GPS_TIMEOUT" : "GPS_UNAVAILABLE";
					},
					{ enableHighAccuracy: true, maximumAge: 0, timeout: GPS_WINDOW_MS },
				);
				if (finished || attempt !== generation) geolocation.clearWatch(id);
				else watch = id;
			} catch {
				finish(undefined, "GPS_UNAVAILABLE");
			}
		};
		const onVisibility = () => {
			if (finished) return;
			if (visibility?.hidden) {
				if (!paused) suspend();
				paused = true;
			} else if (paused) {
				paused = false;
				if (++resumes <= 1) start();
				else finish(undefined, "GPS_INTERRUPTED");
			}
		};
		signal.addEventListener("abort", cancel, { once: true });
		visibility?.addEventListener("visibilitychange", onVisibility);
		if (!visibility?.hidden) start();
	});
}
