import { afterAll, expect, test } from "bun:test";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { createDb } from "../index";
import {
	committeeDivisions,
	committeeMembers,
	committeePositionCodes,
	committees,
} from "./committee";

const db = createDb({
	DATABASE_URL: "postgresql://127.0.0.1:1/synthetic_committee",
});
afterAll(() => db.$client.end());

test("committee schema keeps structural identity and attendance separate", () => {
	expect(getTableConfig(committees).columns.map((c) => c.name)).toEqual([
		"id",
		"name",
		"description",
		"created_by_user_id",
		"created_at",
		"updated_at",
	]);
	expect(committees.description.default).toBe("");
	expect(committees.createdAt.getSQLType()).toBe("timestamp with time zone");
	for (const table of [committees, committeeDivisions, committeeMembers]) {
		expect(getTableConfig(table).enableRLS).toBe(true);
		for (const fk of getTableConfig(table).foreignKeys)
			expect(fk.onDelete).not.toBe("cascade");
	}
});

test("one membership and an exact same-committee composite division FK are enforced", () => {
	const config = getTableConfig(committeeMembers);
	expect(config.primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
		"committee_id",
		"user_id",
	]);
	const division = config.foreignKeys
		.find((fk) => fk.getName() === "committee_members_committee_division_fkey")
		?.reference();
	expect(division?.columns.map((c) => c.name)).toEqual([
		"committee_id",
		"division_id",
	]);
	expect(division?.foreignColumns.map((c) => c.name)).toEqual([
		"committee_id",
		"id",
	]);
	expect(division?.foreignTable).toBe(committeeDivisions);
	expect(
		config.foreignKeys.some((fk) =>
			fk.reference().foreignColumns.some((c) => c.name === "user_id"),
		),
	).toBe(true);
	const positionCheck = config.checks[0];
	if (!positionCheck) throw Error("Missing committee position constraint");
	const sql = new PgDialect().sqlToQuery(positionCheck.value).sql;
	for (const code of committeePositionCodes) expect(sql).toContain(`'${code}'`);
	expect(committeePositionCodes).toEqual([
		"ANGGOTA",
		"SEKDEP",
		"KADEP",
		"SEKRE",
		"BENDAHARA",
		"PIC1",
		"PIC2",
		"PJ",
	]);
});

test("dynamic division names use per-committee trim/case normalization and indexed FK reads", () => {
	const config = getTableConfig(committeeDivisions);
	const nameIndex = config.indexes.find(
		(i) => i.config.name === "committee_divisions_committee_name_idx",
	);
	expect(nameIndex?.config.unique).toBe(true);
	const expression = nameIndex?.config.columns[1];
	expect(
		new PgDialect().sqlToQuery(
			expression as Parameters<PgDialect["sqlToQuery"]>[0],
		).sql,
	).toContain("lower(btrim(");
	expect(
		getTableConfig(committeeMembers).indexes.map((i) => i.config.name),
	).toEqual(["committee_members_user_idx", "committee_members_division_idx"]);
});

test("committee relations compile without losing existing auth/identity relations", () => {
	const query = db.query.committees
		.findMany({
			with: {
				creator: true,
				divisions: true,
				members: { with: { sr: true, division: true } },
			},
		})
		.toSQL();
	expect(query.sql).toContain("committee_members");
	expect(query.sql).toContain("sr_profiles");
	expect(
		db.query.user.findMany({ with: { sessions: true, profile: true } }).toSQL()
			.sql,
	).toContain("user_profiles");
});
