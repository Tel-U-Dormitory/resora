import type { getCommitteeRoster } from "../committee/committee.public";
import type { ActiveDtCandidate } from "../dt/dt.public";
import type { SrCandidate } from "../identity/identity.public";
import type { RosterCriteria } from "./event.types";

export function dtCandidateToRosterCandidate(
	dt: ActiveDtCandidate,
): SrCandidate {
	return {
		userId: dt.userId,
		nim: dt.nim,
		name: dt.name,
		departmentCode: dt.departmentCode ?? "DT",
		positionCode: "DT",
		buildingId: dt.buildingId ?? "",
		buildingCode: dt.buildingCode ?? "DT",
		buildingName: dt.buildingName ?? "Dorm Team",
	};
}

export function resolveCommitteeRoster(
	candidates: readonly SrCandidate[],
	criteria: RosterCriteria,
	members: Awaited<ReturnType<typeof getCommitteeRoster>>["members"],
	defaultMemberIds = new Set(members.map((row) => row.userId)),
	dtCandidates: readonly ActiveDtCandidate[] = [],
) {
	const selected = new Set([
		...defaultMemberIds,
		...criteria.individuals,
		...criteria.include,
	]);
	const excluded = new Set(criteria.exclude);
	const assignments = new Map(members.map((row) => [row.userId, row]));
	const allCandidates = [
		...candidates,
		...dtCandidates.map(dtCandidateToRosterCandidate),
	];
	return [
		...new Map(
			allCandidates
				.filter((sr) => selected.has(sr.userId) && !excluded.has(sr.userId))
				.map((sr) => {
					const assignment = assignments.get(sr.userId);
					return [
						sr.userId,
						{
							...sr,
							committeeDivision: assignment?.committeeDivision ?? null,
							committeePosition: assignment?.committeePosition ?? null,
						},
					] as const;
				}),
		).values(),
	].sort((a, b) => a.nim.localeCompare(b.nim));
}

export function resolveRoster(
	candidates: readonly SrCandidate[],
	criteria: RosterCriteria,
	dtCandidates: readonly ActiveDtCandidate[] = [],
) {
	const individuals = new Set([...criteria.individuals, ...criteria.include]);
	const excluded = new Set(criteria.exclude);
	const departments = new Set<string>(criteria.departments);
	const allCandidates = [
		...candidates,
		...dtCandidates.map(dtCandidateToRosterCandidate),
	];
	return [
		...new Map(
			allCandidates
				.filter(
					(sr) =>
						!excluded.has(sr.userId) &&
						((sr.positionCode === "DT"
							? Boolean(criteria.allDt)
							: criteria.allSr ||
								departments.has(sr.departmentCode) ||
								(criteria.inti && sr.departmentCode === "INTI") ||
								(criteria.kadep &&
									sr.departmentCode !== "INTI" &&
									sr.positionCode === "KADEP")) ||
							individuals.has(sr.userId)),
				)
				.map((sr) => [sr.userId, sr]),
		).values(),
	].sort((a, b) => a.nim.localeCompare(b.nim));
}
