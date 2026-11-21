import {
	pointsCellValue,
	pointsEventHeading,
	pointsSummaryLabels,
	pointsSummaryValues,
} from "./points.contracts";
import type { pointsRecap } from "./points-recap";
import { csvCell } from "./reporting-policy";

export function pointsCsv(report: Awaited<ReturnType<typeof pointsRecap>>) {
	const headers = [
		"NIM",
		"Nama",
		"Departemen (saat ini)",
		"Gedung (saat ini)",
		...report.events.map(pointsEventHeading),
		...pointsSummaryLabels,
	];
	const lines = [headers.map((value) => csvCell(value)).join(",")];
	for (const row of report.participants) {
		const values = [
			row.nim,
			row.name,
			row.currentDepartmentCode,
			row.currentBuildingName ?? row.currentBuildingCode,
			...row.events.map(pointsCellValue),
			...pointsSummaryValues(row, report.events.length > 0),
		];
		lines.push(
			values
				.map((value, index) =>
					typeof value === "number"
						? String(value)
						: csvCell(value, index === 0),
				)
				.join(","),
		);
	}
	return `\uFEFF${lines.join("\r\n")}\r\n`;
}
