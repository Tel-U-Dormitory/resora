export type SessionFact = {
	id: string;
	internalEventId: string;
	status: "INACTIVE" | "ACTIVE" | "CLOSED";
	centerLat: number;
	centerLng: number;
	geofenceRadiusM: number;
	lateGraceMinutes: number;
	qrTtlMinutes: number;
	activatedAt: Date | null;
	closedAt: Date | null;
};
