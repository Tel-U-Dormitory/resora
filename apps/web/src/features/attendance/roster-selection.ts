import type { AppRouter } from "@resora/api/routers/index";
import type { inferRouterInputs } from "@trpc/server";

type Criteria = NonNullable<
	inferRouterInputs<AppRouter>["attendance"]["create"]["rosterCriteria"]
>;
export type RosterCandidate = {
	userId: string;
	nim: string;
	name: string;
	departmentCode: string;
	positionCode: string;
};

// Mirror the existing union/exclusion contract using only server-eligible candidates.
function selectedByGroup(sr: RosterCandidate, criteria: Criteria) {
	return Boolean(
		criteria.allSr ||
			criteria.departments?.some((code) => code === sr.departmentCode) ||
			(criteria.inti && sr.departmentCode === "INTI") ||
			(criteria.kadep &&
				sr.departmentCode !== "INTI" &&
				sr.positionCode === "KADEP"),
	);
}

export function isInvited(sr: RosterCandidate, criteria: Criteria) {
	return Boolean(
		!criteria.exclude?.includes(sr.userId) &&
			(selectedByGroup(sr, criteria) ||
				criteria.individuals?.includes(sr.userId) ||
				criteria.include?.includes(sr.userId)),
	);
}

export function setParticipantInvitation(
	criteria: Criteria,
	sr: RosterCandidate,
	checked: boolean,
): Criteria {
	const without = (values: readonly string[] = []) =>
		[...new Set(values)].filter((id) => id !== sr.userId);
	const individuals = without(criteria.individuals);
	const include = without(criteria.include);
	const exclude = without(criteria.exclude);
	if (checked && !selectedByGroup(sr, criteria)) include.push(sr.userId);
	if (!checked && selectedByGroup(sr, criteria)) exclude.push(sr.userId);
	return { ...criteria, individuals, include, exclude };
}
