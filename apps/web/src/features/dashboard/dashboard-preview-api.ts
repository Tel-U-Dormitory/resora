import type {
	DashboardFixture,
	DashboardMetric,
	DashboardMetricState,
	DashboardScenario,
} from "./dashboard.contracts";

export class DashboardPreviewError extends Error {
	constructor(public readonly status: number | "timeout") {
		super(
			status === "timeout"
				? "Waktu tunggu habis. Coba muat kembali."
				: status === 401
					? "Sesi berakhir. Masuk kembali untuk melanjutkan."
					: status === 403
						? "Akses ke data ini ditolak."
						: status === 429
							? "Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi."
							: "Data gagal dimuat. Coba muat kembali.",
		);
	}
}

// This transport simulates JSON-backed responses, never backend authorization.
export async function waitForDashboardPreview(
	scenario: DashboardScenario,
	signal?: AbortSignal,
) {
	if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test")
		throw new Error("Dashboard preview is disabled in production");
	signal?.throwIfAborted();
	await new Promise<void>((resolve, reject) => {
		const abort = () => {
			clearTimeout(timer);
			reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
		};
		const timer = setTimeout(
			() => {
				signal?.removeEventListener("abort", abort);
				resolve();
			},
			scenario === "slow" ? 2500 : 180,
		);
		signal?.addEventListener("abort", abort, { once: true });
	});
	signal?.throwIfAborted();
	if (scenario === "timeout") throw new DashboardPreviewError("timeout");
	if (["401", "403", "429", "500", "503"].includes(scenario))
		throw new DashboardPreviewError(Number(scenario));
}

export async function requestDashboardMetric(
	metric: DashboardMetric,
	scenario: DashboardScenario = "ready",
	signal?: AbortSignal,
): Promise<DashboardMetric> {
	await waitForDashboardPreview(scenario, signal);
	let state: DashboardMetricState = structuredClone(metric.state);
	if (scenario === "zero") {
		state =
			metric.state.kind === "ready_summary"
				? {
						...metric.state,
						values: metric.state.values.map((value) => ({
							...value,
							value: 0,
						})),
					}
				: {
						kind: "ready",
						value: 0,
						unit: "laporan",
						note: "Data sintetis untuk preview",
					};
	} else if (
		[
			"empty",
			"not_assessed",
			"missing_period",
			"unavailable",
			"stale",
		].includes(scenario)
	) {
		const { dashboardStateFixtures } = await import("./dashboard-fixtures");
		// Explicit cases keep domain payloads distinct from transport failures.
		switch (scenario) {
			case "empty":
				state = { ...dashboardStateFixtures.empty, kind: "empty" };
				break;
			case "not_assessed":
				state = {
					...dashboardStateFixtures.not_assessed,
					kind: "not_assessed",
				};
				break;
			case "missing_period":
				state = {
					...dashboardStateFixtures.missing_period,
					kind: "missing_period",
				};
				break;
			case "unavailable":
				state = { ...dashboardStateFixtures.unavailable, kind: "unavailable" };
				break;
			case "stale":
				state = { ...dashboardStateFixtures.stale, kind: "stale" };
				break;
		}
	}
	const ready = state.kind === "ready" || state.kind === "ready_summary";
	return {
		...structuredClone(metric),
		state,
		export: ready ? metric.export : null,
		period:
			scenario === "missing_period"
				? { label: "Periode belum tersedia", startsAt: null, endsAt: null }
				: metric.period,
	};
}

export function previewFailureState(
	error: unknown,
): Extract<DashboardMetricState, { kind: "error" | "forbidden" }> {
	return {
		kind:
			error instanceof DashboardPreviewError &&
			[401, 403].includes(Number(error.status))
				? "forbidden"
				: "error",
		message:
			error instanceof DashboardPreviewError
				? error.message
				: "Data gagal dimuat. Coba muat kembali.",
	};
}

export async function requestDashboardActivities(
	fixture: DashboardFixture,
	scenario: DashboardScenario = "ready",
	signal?: AbortSignal,
	now = Date.now(),
) {
	await waitForDashboardPreview(scenario, signal);
	return {
		activities:
			scenario === "empty"
				? []
				: fixture.activities
						.filter(
							(item) =>
								item.status === "PUBLISHED" &&
								item.visible &&
								new Date(item.startsAt).getTime() >= now,
						)
						.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
						.slice(0, 5)
						.map(({ id, title, startsAt, endsAt }) => ({
							id,
							title,
							startsAt,
							endsAt,
						})),
		attendanceHistory:
			scenario === "empty"
				? []
				: structuredClone(fixture.attendanceHistory.slice(0, 3)),
	};
}
export async function requestDashboardBroadcasts(
	fixture: DashboardFixture,
	scenario: DashboardScenario = "ready",
	signal?: AbortSignal,
	now = Date.now(),
) {
	await waitForDashboardPreview(scenario, signal);
	return scenario === "empty"
		? []
		: structuredClone(
				fixture.broadcasts
					.filter(
						(item) =>
							Date.parse(item.publishedAt) <= now &&
							Date.parse(item.expiresAt) > now,
					)
					.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
					.slice(0, 3),
			);
}
