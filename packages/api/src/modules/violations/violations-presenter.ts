export type PublicReportRow = {
	id: string;
	publicCode: string;
	studentName: string;
	studentNim: string;
	incidentDate: string;
	description: string;
	reporterUserId: string;
	recordedBuildingId: string;
	recordedBuildingName: string;
	ktmObjectKey: string;
	recordedAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
	deletedByUserId: string | null;
	deleteReason: string | null;
};

export function publicReport(
	row: PublicReportRow,
	reporterName: string | null,
	includeDeletedDetails = false,
) {
	const redact = row.deletedAt !== null && !includeDeletedDetails;
	return {
		id: row.id,
		publicCode: row.publicCode,
		studentName: redact ? null : row.studentName,
		studentNim: redact ? null : row.studentNim,
		incidentDate: redact ? null : row.incidentDate,
		description: redact ? null : row.description,
		reporterUserId: redact ? null : row.reporterUserId,
		reporterName: redact ? null : reporterName,
		recordedBuildingId: row.recordedBuildingId,
		recordedBuildingName: row.recordedBuildingName,
		recordedAt: row.recordedAt,
		updatedAt: row.updatedAt,
		deletedAt: row.deletedAt,
		deletedByUserId: redact ? null : row.deletedByUserId,
		deleteReason: row.deleteReason,
	};
}
