import { sql } from "drizzle-orm";
import type { Database, DatabaseTransaction } from "./index";
import {
	buildings,
	departments,
	positions,
	srProfiles,
} from "./schema/identity";

export const officialDepartments = [
	{ code: "INTI", name: "Inti" },
	{ code: "ADAPTIF", name: "Adaptif" },
	{ code: "SOSIAL", name: "Sosial" },
	{ code: "AKADEMIK", name: "Akademik" },
	{ code: "SPIRITUAL", name: "Spiritual" },
	{ code: "HCO", name: "HCO" },
	{ code: "MEDIA", name: "Media" },
	{ code: "RND", name: "RnD" },
] as const;

// Reuse for CSV, future assignment mutations and organization roster eligibility.
export function isValidSrAssignment(
	departmentCode: string,
	positionCode: string,
) {
	if (!officialDepartments.some((row) => row.code === departmentCode))
		return false;
	return departmentCode === "INTI"
		? ["KETUM", "WAKETUM", "SEKRETARIS", "BENDAHARA"].includes(positionCode)
		: ["KADEP", "SEKDEP", "ANGGOTA"].includes(positionCode);
}
export const officialPositions = [
	{ code: "KETUM", name: "Ketum" },
	{ code: "WAKETUM", name: "Waketum" },
	{ code: "SEKRETARIS", name: "Sekretaris" },
	{ code: "BENDAHARA", name: "Bendahara" },
	{ code: "KADEP", name: "Kadep" },
	{ code: "SEKDEP", name: "Sekdep" },
	{ code: "ANGGOTA", name: "Anggota" },
] as const;
export const officialBuildingCodes = [
	"A",
	"B",
	"C",
	"D",
	"E",
	"F",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"10",
	"11",
	"12",
] as const;
export const officialBuildings = officialBuildingCodes.map((code) => ({
	code,
	name: `Gedung ${code}`,
}));

type DictionaryRow = { code: string; name: string; isActive: boolean };
type ReferenceRow = { code: string; name: string };
export type OrganizationConflict = {
	table: "departments" | "positions" | "buildings" | "sr_profiles";
	code: string;
	reason:
		| "LEGACY_CODE"
		| "NAME_MISMATCH"
		| "INACTIVE_REFERENCE"
		| "INVALID_ASSIGNMENT";
};
export class OrganizationConflictError extends Error {
	constructor(readonly conflicts: OrganizationConflict[]) {
		super("ORGANIZATION_REFERENCE_CONFLICT: no reference data changed");
		this.name = "OrganizationConflictError";
	}
}

function inspect(
	table: OrganizationConflict["table"],
	actual: DictionaryRow[],
	expected: readonly ReferenceRow[],
) {
	const definitions = new Map(expected.map((row) => [row.code, row.name]));
	const conflicts: OrganizationConflict[] = [];
	for (const row of actual) {
		const name = definitions.get(row.code);
		if (!name) conflicts.push({ table, code: row.code, reason: "LEGACY_CODE" });
		else {
			if (row.name !== name)
				conflicts.push({ table, code: row.code, reason: "NAME_MISMATCH" });
			if (!row.isActive)
				conflicts.push({ table, code: row.code, reason: "INACTIVE_REFERENCE" });
		}
	}
	const codes = new Set(actual.map((row) => row.code));
	return { conflicts, missing: expected.filter((row) => !codes.has(row.code)) };
}

// One identity-specific seed, not a generic seed framework. CLI guards the local target.
export async function seedOrganization(
	db: Database | DatabaseTransaction,
	apply = true,
) {
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtext('resora:organization-seed'))`,
		);
		const departmentRows = await tx.select().from(departments).for("share");
		const positionRows = await tx.select().from(positions).for("share");
		const buildingRows = await tx.select().from(buildings).for("share");
		const assignments = await tx.select().from(srProfiles).for("share");
		const departmentPlan = inspect(
			"departments",
			departmentRows,
			officialDepartments,
		);
		const positionPlan = inspect("positions", positionRows, officialPositions);
		const buildingPlan = inspect("buildings", buildingRows, officialBuildings);
		const conflicts = [
			...departmentPlan.conflicts,
			...positionPlan.conflicts,
			...buildingPlan.conflicts,
			...assignments
				.filter(
					(row) => !isValidSrAssignment(row.departmentCode, row.positionCode),
				)
				.map(
					(row): OrganizationConflict => ({
						table: "sr_profiles",
						code: `${row.departmentCode}/${row.positionCode}`,
						reason: "INVALID_ASSIGNMENT",
					}),
				),
		];
		if (conflicts.length) throw new OrganizationConflictError(conflicts);
		if (apply) {
			if (departmentPlan.missing.length)
				await tx.insert(departments).values(departmentPlan.missing);
			if (positionPlan.missing.length)
				await tx.insert(positions).values(positionPlan.missing);
			if (buildingPlan.missing.length)
				await tx.insert(buildings).values(buildingPlan.missing);
		}
		return {
			departments: departmentPlan.missing.length,
			positions: positionPlan.missing.length,
			buildings: buildingPlan.missing.length,
		};
	});
}
