import { committeePositionLabels } from "../committee/committee-positions";

export const nonCommitteeLabel = "Non-Panitia / Undangan";
export type ReportingContext = {
	organizationContext?: "SR" | "COMMITTEE";
	committeeName?: string | null;
};
export type OrganizationSnapshot = {
	departmentCode: string;
	positionCode: string;
	committeeDivision?: string | null;
	committeePosition?: string | null;
};
export type RecapFilters = {
	division?: string;
	position?: string;
	participantType?: "ALL" | "COMMITTEE" | "GUEST";
	search?: string;
};

// Values are snapshot keys for filtering; labels are display-only, never structural fallbacks.
export function eventAssignment(
	event: ReportingContext,
	row: OrganizationSnapshot,
) {
	if (event.organizationContext !== "COMMITTEE")
		return {
			division: row.departmentCode,
			position: row.positionCode,
			divisionLabel: row.departmentCode,
			positionLabel: row.positionCode,
			isCommitteeMember: false,
		};
	const isCommitteeMember =
		row.committeeDivision != null && row.committeePosition != null;
	const position = isCommitteeMember ? (row.committeePosition ?? "") : "";
	return {
		division: isCommitteeMember ? (row.committeeDivision ?? "") : "",
		position,
		isCommitteeMember,
		divisionLabel: isCommitteeMember
			? (row.committeeDivision ?? "")
			: nonCommitteeLabel,
		positionLabel: isCommitteeMember
			? ((committeePositionLabels as Record<string, string>)[position] ??
				position)
			: nonCommitteeLabel,
	};
}

export function filterRecapParticipants<
	T extends OrganizationSnapshot & { name: string; nim: string },
>(event: ReportingContext, rows: readonly T[], filters: RecapFilters = {}) {
	const search = filters.search?.trim().toLocaleLowerCase("id") ?? "";
	return rows.filter((row) => {
		const assignment = eventAssignment(event, row);
		return (
			(!filters.division || assignment.division === filters.division) &&
			(!filters.position || assignment.position === filters.position) &&
			(!search ||
				`${row.name} ${row.nim}`.toLocaleLowerCase("id").includes(search)) &&
			(event.organizationContext !== "COMMITTEE" ||
				!filters.participantType ||
				filters.participantType === "ALL" ||
				(filters.participantType === "COMMITTEE"
					? assignment.isCommitteeMember
					: !assignment.isCommitteeMember))
		);
	});
}

export function recapFilterOptions(
	event: ReportingContext,
	rows: readonly OrganizationSnapshot[],
) {
	const divisions = new Map<string, string>();
	const positions = new Map<string, string>();
	for (const row of rows) {
		const assignment = eventAssignment(event, row);
		if (assignment.division)
			divisions.set(assignment.division, assignment.divisionLabel);
		if (assignment.position)
			positions.set(assignment.position, assignment.positionLabel);
	}
	const ordered = (values: Map<string, string>) =>
		[...values]
			.map(([value, label]) => ({ value, label }))
			.sort(
				(a, b) =>
					a.label.localeCompare(b.label, "id") ||
					a.value.localeCompare(b.value),
			);
	return { divisions: ordered(divisions), positions: ordered(positions) };
}
