export type DashboardMode = "personal" | "management";
export type DashboardScope = "individual" | "department" | "organization";
export type DashboardPeriod = {
	label: string;
	startsAt: string | null;
	endsAt: string | null;
};

export type DashboardMetricState =
	| { kind: "ready"; value: number; unit: string | null; note: string | null }
	| {
			kind: "ready_summary";
			values: Array<{ label: string; value: number; unit: string | null }>;
			note: string | null;
	  }
	| { kind: "empty"; message: string }
	| { kind: "not_assessed"; message: string }
	| { kind: "missing_period"; message: string }
	| { kind: "coming_soon"; message: string }
	| { kind: "unavailable"; message: string }
	| { kind: "forbidden"; message: string };

export type DashboardExportCapability = {
	report: "assessment" | "attendance" | "violations";
	formats: Array<"xlsx" | "pdf" | "csv">;
	filters: Array<"period" | "department">;
};

export type DashboardMetric = {
	id: "assessment" | "attendance" | "violations" | "cleanliness";
	title: string;
	period: DashboardPeriod;
	scope: DashboardScope;
	state: DashboardMetricState;
	export: DashboardExportCapability | null;
};

export type DashboardActivity = {
	id: string;
	title: string;
	startsAt: string;
	endsAt: string;
};

export type DashboardAttendanceActivity = DashboardActivity & {
	presence: "PRESENT" | "PENDING" | "ABSENT";
};

export type DashboardFixture = {
	mode: DashboardMode;
	scope: DashboardScope;
	metrics: DashboardMetric[];
	activities: DashboardActivity[];
	attendanceHistory: DashboardAttendanceActivity[];
};
