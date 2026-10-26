import type { RosterCriteria } from "@resora/db/schema/attendance";
import type { getCommitteeRoster } from "../committee/committee.public";
import type { SrCandidate } from "../identity/identity.public";

export function resolveCommitteeRoster(
	candidates: readonly SrCandidate[],
	criteria: RosterCriteria,
	members: Awaited<ReturnType<typeof getCommitteeRoster>>["members"],
	defaultMemberIds = new Set(members.map((row) => row.userId)),
) {
	const selected = new Set([
		...defaultMemberIds,
		...criteria.individuals,
		...criteria.include,
	]);
	const excluded = new Set(criteria.exclude);
	const assignments = new Map(members.map((row) => [row.userId, row]));
	return [
		...new Map(
			candidates
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
) {
	const individuals = new Set([...criteria.individuals, ...criteria.include]);
	const excluded = new Set(criteria.exclude);
	const departments = new Set<string>(criteria.departments);
	return [
		...new Map(
			candidates
				.filter(
					(sr) =>
						!excluded.has(sr.userId) &&
						(criteria.allSr ||
							departments.has(sr.departmentCode) ||
							(criteria.inti && sr.departmentCode === "INTI") ||
							(criteria.kadep &&
								sr.departmentCode !== "INTI" &&
								sr.positionCode === "KADEP") ||
							individuals.has(sr.userId)),
				)
				.map((sr) => [sr.userId, sr]),
		).values(),
	].sort((a, b) => a.nim.localeCompare(b.nim));
}
