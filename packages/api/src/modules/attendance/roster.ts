import type { RosterCriteria } from "@resora/db/schema/attendance";
import type { SrCandidate } from "../identity/identity.public";

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
