import type { VisibilityAction } from "../../contracts/attendance";

import type { EventFact, RosterCriteria } from "./events.public";

export function sameRoster(left: RosterCriteria, right: RosterCriteria) {
	const normalize = (criteria: RosterCriteria) => ({
		allSr: criteria.allSr,
		allDt: Boolean(criteria.allDt),
		inti: criteria.inti,
		kadep: criteria.kadep,
		departments: [...new Set(criteria.departments)].sort(),
		individuals: [...new Set(criteria.individuals)].sort(),
		include: [...new Set(criteria.include)].sort(),
		exclude: [...new Set(criteria.exclude)].sort(),
	});
	return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export function visibilityActions(
	event: EventFact,
	session: { status: string },
): VisibilityAction[] {
	const closed = event.status === "CLOSED" && session.status === "CLOSED";
	const inactive =
		event.status === "PUBLISHED" && session.status === "INACTIVE";
	if (!closed && !inactive) return [];
	if (event.visibility === "ARCHIVED") return closed ? ["RESTORE"] : [];
	const actions: VisibilityAction[] = [];
	if (event.visibility === "VISIBLE") actions.push("HIDE");
	if (event.visibility === "HIDDEN") actions.push("UNHIDE");
	if (closed) actions.push("ARCHIVE");
	return actions;
}

export function isDtScopedCriteria(
	criteria: Pick<
		RosterCriteria,
		"allSr" | "inti" | "kadep" | "departments" | "allDt" | "individuals" | "include"
	>,
	organizationContext: string | null | undefined,
	dtUserIds: ReadonlySet<string>,
) {
	if ((organizationContext ?? "SR") !== "SR") return false;
	if (
		criteria.allSr ||
		criteria.inti ||
		criteria.kadep ||
		criteria.departments.length > 0
	) {
		return false;
	}
	const explicit = [...criteria.individuals, ...criteria.include];
	if (!explicit.every((id) => dtUserIds.has(id))) return false;
	return Boolean(criteria.allDt || explicit.length > 0);
}
