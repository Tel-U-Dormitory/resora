import { defineRelationsPart, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const actorType = pgEnum("actor_type", [
	"SR",
	"MAHASISWA",
	"ASUS",
	"DITMAWA",
	"SYSTEM_ADMIN",
]);
export const systemPrivilege = pgEnum("system_privilege", ["SUPERADMIN"]);

export const userProfiles = pgTable(
	"user_profiles",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		actor: actorType("actor").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		mustChangePassword: boolean("must_change_password").default(true).notNull(),
		passwordResetRequired: boolean("password_reset_required")
			.default(false)
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("user_profiles_actor_active_idx").on(table.actor, table.isActive),
	],
);

export const departments = pgTable(
	"departments",
	{
		code: text("code").primaryKey(),
		name: text("name").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
	},
	(table) => [
		check("departments_code_nonblank", sql`length(btrim(${table.code})) > 0`),
		check("departments_name_nonblank", sql`length(btrim(${table.name})) > 0`),
	],
);

export const positions = pgTable(
	"positions",
	{
		code: text("code").primaryKey(),
		name: text("name").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
	},
	(table) => [
		check("positions_code_nonblank", sql`length(btrim(${table.code})) > 0`),
		check("positions_name_nonblank", sql`length(btrim(${table.name})) > 0`),
	],
);

export const buildings = pgTable(
	"buildings",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		code: text("code").notNull().unique(),
		name: text("name").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
	},
	(table) => [
		check("buildings_code_nonblank", sql`length(btrim(${table.code})) > 0`),
		check("buildings_name_nonblank", sql`length(btrim(${table.name})) > 0`),
	],
);

export const srProfiles = pgTable(
	"sr_profiles",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => userProfiles.userId),
		departmentCode: text("department_code")
			.notNull()
			.references(() => departments.code),
		positionCode: text("position_code")
			.notNull()
			.references(() => positions.code),
		buildingId: uuid("building_id")
			.notNull()
			.references(() => buildings.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("sr_profiles_department_idx").on(table.departmentCode),
		index("sr_profiles_position_idx").on(table.positionCode),
		index("sr_profiles_building_idx").on(table.buildingId),
	],
);

export const systemPrivileges = pgTable(
	"system_privileges",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		privilegeCode: systemPrivilege("privilege_code").notNull(),
		grantedAt: timestamp("granted_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		grantedByUserId: text("granted_by_user_id").references(() => user.id),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.privilegeCode] }),
		index("system_privileges_granted_by_idx").on(table.grantedByUserId),
	],
);

export const accountAuditLogs = pgTable(
	"account_audit_logs",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		actorUserId: text("actor_user_id").references(() => user.id),
		targetUserId: text("target_user_id")
			.notNull()
			.references(() => user.id),
		action: text("action").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		check(
			"account_audit_logs_action_check",
			sql`(${table.action} IN ('ACCOUNT_CREATED', 'PASSWORD_RESET') AND ${table.actorUserId} IS NOT NULL) OR (${table.action} = 'SYSTEM_ADMIN_BOOTSTRAPPED' AND ${table.actorUserId} IS NULL)`,
		),
		index("account_audit_logs_actor_created_idx").on(
			table.actorUserId,
			table.createdAt,
		),
		index("account_audit_logs_target_created_idx").on(
			table.targetUserId,
			table.createdAt,
		),
	],
);

// Cross-table SR/actor consistency is enforced by deferred constraint triggers
// in the versioned identity integrity migration (not expressible by a CHECK).
export const identityRelations = defineRelationsPart(
	{
		user,
		userProfiles,
		srProfiles,
		departments,
		positions,
		buildings,
		systemPrivileges,
		accountAuditLogs,
	},
	(r) => ({
		user: {
			profile: r.one.userProfiles({
				from: r.user.id,
				to: r.userProfiles.userId,
			}),
			privileges: r.many.systemPrivileges({
				from: r.user.id,
				to: r.systemPrivileges.userId,
				alias: "grantee",
			}),
			grants: r.many.systemPrivileges({
				from: r.user.id,
				to: r.systemPrivileges.grantedByUserId,
				alias: "grantor",
			}),
		},
		userProfiles: {
			user: r.one.user({
				from: r.userProfiles.userId,
				to: r.user.id,
				optional: false,
			}),
			srProfile: r.one.srProfiles({
				from: r.userProfiles.userId,
				to: r.srProfiles.userId,
			}),
		},
		srProfiles: {
			profile: r.one.userProfiles({
				from: r.srProfiles.userId,
				to: r.userProfiles.userId,
				optional: false,
			}),
			department: r.one.departments({
				from: r.srProfiles.departmentCode,
				to: r.departments.code,
				optional: false,
			}),
			position: r.one.positions({
				from: r.srProfiles.positionCode,
				to: r.positions.code,
				optional: false,
			}),
			building: r.one.buildings({
				from: r.srProfiles.buildingId,
				to: r.buildings.id,
				optional: false,
			}),
		},
		departments: {
			members: r.many.srProfiles({
				from: r.departments.code,
				to: r.srProfiles.departmentCode,
			}),
		},
		positions: {
			members: r.many.srProfiles({
				from: r.positions.code,
				to: r.srProfiles.positionCode,
			}),
		},
		buildings: {
			members: r.many.srProfiles({
				from: r.buildings.id,
				to: r.srProfiles.buildingId,
			}),
		},
		systemPrivileges: {
			user: r.one.user({
				from: r.systemPrivileges.userId,
				to: r.user.id,
				alias: "grantee",
				optional: false,
			}),
			grantedBy: r.one.user({
				from: r.systemPrivileges.grantedByUserId,
				to: r.user.id,
				alias: "grantor",
			}),
		},
		accountAuditLogs: {
			actor: r.one.user({
				from: r.accountAuditLogs.actorUserId,
				to: r.user.id,
				optional: true,
			}),
			target: r.one.user({
				from: r.accountAuditLogs.targetUserId,
				to: r.user.id,
				optional: false,
			}),
		},
	}),
);
