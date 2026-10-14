import { afterAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";

import { createDb } from "../index";
import { relations } from "../relations";
import { user } from "./auth";
import {
	actorType,
	buildings,
	departments,
	positions,
	srProfiles,
	systemPrivilege,
	systemPrivileges,
	userProfiles,
} from "./identity";

// Pool creation and toSQL() never acquire a connection. No env files are loaded.
const db = createDb({
	DATABASE_URL: "postgresql://localhost:1/synthetic_phase2a",
});
afterAll(() => db.$client.end());

test("synthetic NIM keeps leading zeros in Better Auth's single source of truth", () => {
	const nim = "0000123456";
	const query = db
		.insert(user)
		.values({
			id: "synthetic-sr",
			name: "Synthetic SR",
			email: "synthetic-sr@example.invalid",
			username: nim,
		})
		.toSQL();
	expect(query.params).toContain(nim);
	expect(query.params).not.toContain(Number(nim));
	expect(user.username.isUnique).toBe(true);
	expect(user.username.notNull).toBe(false);
	expect(user.displayUsername.getSQLType()).toBe("text");
	expect(
		getTableConfig(srProfiles).columns.map((column) => column.name),
	).not.toContain("nim");
});

test("primary actors are exclusive and superadmin is a separate system privilege", () => {
	expect(actorType.enumValues).toEqual([
		"SR",
		"MAHASISWA",
		"ASUS",
		"DITMAWA",
		"SYSTEM_ADMIN",
	]);
	expect(systemPrivilege.enumValues).toEqual(["SUPERADMIN"]);
	expect(userProfiles.userId.primary).toBe(true);
	expect(userProfiles.actor.notNull).toBe(true);
	expect(userProfiles.isActive.default).toBe(true);
	expect(userProfiles.mustChangePassword.default).toBe(true);
	expect(
		getTableConfig(systemPrivileges).primaryKeys[0]?.columns.map(
			(column) => column.name,
		),
	).toEqual(["user_id", "privilege_code"]);
	expect(systemPrivileges.grantedByUserId.notNull).toBe(false);
});

test("SR identity requires complete assignments and references the actor profile", () => {
	expect(srProfiles.userId.primary).toBe(true);
	for (const column of [
		srProfiles.departmentCode,
		srProfiles.positionCode,
		srProfiles.buildingId,
	]) {
		expect(column.notNull).toBe(true);
	}
	const references = getTableConfig(srProfiles).foreignKeys.map((fk) => {
		const reference = fk.reference();
		return [
			reference.columns[0]?.name,
			getTableConfig(reference.foreignTable).name,
			reference.foreignColumns[0]?.name,
		];
	});
	expect(references).toEqual([
		["user_id", "user_profiles", "user_id"],
		["department_code", "departments", "code"],
		["position_code", "positions", "code"],
		["building_id", "buildings", "id"],
	]);
	expect(
		getTableConfig(srProfiles).indexes.map((index) => index.config.name),
	).toEqual([
		"sr_profiles_department_idx",
		"sr_profiles_position_idx",
		"sr_profiles_building_idx",
	]);
});

test("dictionary identifiers/names are required, unique and nonblank", () => {
	const dialect = new PgDialect();
	for (const table of [departments, positions, buildings]) {
		expect(table.code.notNull).toBe(true);
		expect(table.name.notNull).toBe(true);
		expect(table.isActive.default).toBe(true);
		const checks = getTableConfig(table).checks.map(
			(check) => dialect.sqlToQuery(check.value).sql,
		);
		expect(checks).toHaveLength(2);
		for (const check of checks) expect(check).toContain("btrim");
	}
	expect(buildings.code.isUnique).toBe(true);
	expect(buildings.id.hasDefault).toBe(true);
});

test("domain instants use timestamptz without changing generated auth timestamps", () => {
	for (const column of [
		userProfiles.createdAt,
		userProfiles.updatedAt,
		srProfiles.createdAt,
		srProfiles.updatedAt,
		systemPrivileges.grantedAt,
	]) {
		expect(column.getSQLType()).toBe("timestamp with time zone");
		expect(column.notNull).toBe(true);
		expect(column.hasDefault).toBe(true);
	}
	expect(user.createdAt.getSQLType()).toBe("timestamp");
});

test("identity relations preserve Better Auth account/session relations", () => {
	expect(Object.keys(relations.user.relations).sort()).toEqual([
		"accounts",
		"grants",
		"privileges",
		"profile",
		"sessions",
	]);
	const query = db.query.user
		.findFirst({
			where: { id: "synthetic-sr" },
			with: {
				accounts: true,
				sessions: true,
				profile: {
					with: {
						srProfile: {
							with: { department: true, position: true, building: true },
						},
					},
				},
				privileges: true,
				grants: true,
			},
		})
		.toSQL();
	for (const table of [
		"account",
		"session",
		"user_profiles",
		"sr_profiles",
		"departments",
		"positions",
		"buildings",
		"system_privileges",
	]) {
		expect(query.sql).toContain(`"${table}"`);
	}
	expect(query.params).toContain("synthetic-sr");
});

test("unapplied migrations form one additive chain with no duplicate table creation", () => {
	const root = join(import.meta.dir, "../migrations");
	const dirs = readdirSync(root)
		.filter((dir) =>
			/_(phase1_scaffold|phase2a_identity|phase2a_identity_integrity)$/.test(
				dir,
			),
		)
		.sort();
	expect(dirs).toHaveLength(3);
	const sql = dirs
		.map((dir) => readFileSync(join(root, dir, "migration.sql"), "utf8"))
		.join("\n");
	const tables = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map(
		(match) => match[1],
	);
	expect(tables.sort()).toEqual([
		"account",
		"buildings",
		"departments",
		"positions",
		"session",
		"sr_profiles",
		"system_privileges",
		"user",
		"user_profiles",
		"verification",
	]);
	expect(new Set(tables).size).toBe(10);
	expect(sql).not.toMatch(
		/\b(?:DROP|TRUNCATE)\b|DELETE\s+FROM|ALTER\s+COLUMN/i,
	);
	expect(sql).toContain('ALTER TABLE "user" ADD COLUMN "username" text');
	let previousId: string | undefined;
	for (const dir of dirs) {
		const snapshot = JSON.parse(
			readFileSync(join(root, dir, "snapshot.json"), "utf8"),
		) as { id: string; prevIds: string[] };
		if (previousId) expect(snapshot.prevIds).toEqual([previousId]);
		previousId = snapshot.id;
	}
});

test("cross-table integrity is versioned and deferred for atomic provisioning", () => {
	const root = join(import.meta.dir, "../migrations");
	const dir = readdirSync(root).find((dir) =>
		dir.endsWith("_phase2a_identity_integrity"),
	);
	expect(dir).toBeDefined();
	if (!dir) throw new Error("Missing identity integrity migration");
	const sql = readFileSync(join(root, dir, "migration.sql"), "utf8");
	expect(sql.match(/CREATE CONSTRAINT TRIGGER/g)).toHaveLength(3);
	expect(sql.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(3);
	expect(sql).toContain("FOR UPDATE");
	expect(sql).toContain("(current_actor = 'SR') <> has_sr_profile");
	expect(sql).toContain("sr_profile_nim_required");
	expect(sql).toContain("ARRAY[OLD.user_id, NEW.user_id]");
});
