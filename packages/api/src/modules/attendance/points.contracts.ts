// Browser-safe presentation shared by the matrix and CSV; scoring remains in F2.
export const pointsSummaryLabels = [
	"Jumlah Hadir",
	"Jumlah Tidak Hadir",
	"Jumlah Event",
	"Total Poin",
	"Maksimal Poin",
	"Belum Dinilai",
	"Status Rekap",
] as const;
export const pointsStatusLabels = {
	COMPLETE: "Lengkap",
	PARTIAL: "Belum lengkap",
} as const;

export function pointsSummaryValues(
	row: {
		attendedCount: number;
		eventCount: number;
		absentCount: number;
		totalPoints: number;
		maximumPossiblePoints: number;
		unclassifiedCount: number;
		scoringStatus: keyof typeof pointsStatusLabels;
	},
	hasSelectedEvents = true,
) {
	return [
		row.attendedCount,
		row.absentCount,
		row.eventCount,
		row.totalPoints,
		row.maximumPossiblePoints,
		row.unclassifiedCount,
		hasSelectedEvents
			? pointsStatusLabels[row.scoringStatus]
			: "Tanpa event penilaian",
	];
}

export function pointsEventHeading(event: {
	eventId: string;
	title: string;
	startsAt: Date | string;
}) {
	const date = new Intl.DateTimeFormat("id-ID", {
		timeZone: "Asia/Jakarta",
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(event.startsAt));
	return `${event.title} · ${date} WIB [${event.eventId}]`;
}

export function pointsCellValue(cell: {
	scoringStatus: "SCORED" | "UNCLASSIFIED" | "UNSCORABLE" | "NOT_INVITED";
	points: number | null;
}): string | number {
	if (cell.scoringStatus === "SCORED" && cell.points !== null)
		return cell.points;
	if (cell.scoringStatus === "NOT_INVITED") return "—";
	if (cell.scoringStatus === "UNCLASSIFIED") return "Belum dinilai";
	return "Tidak dapat dinilai";
}
