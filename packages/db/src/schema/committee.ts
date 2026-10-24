import { defineRelationsPart, sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { srProfiles } from "./identity";

export const committeePositionCodes = [
	"ANGGOTA",
	"SEKDEP",
	"KADEP",
	"SEKRE",
	"BENDAHARA",
	"PIC1",
	"PIC2",
	"PJ",
] as const;

export const committees = pgTable(
	"committees",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		name: text("name").notNull(),
		description: text("description").notNull().default(""),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		check("committees_name_nonblank", sql`length(btrim(${t.name})) > 0`),
		index("committees_created_by_idx").on(t.createdByUserId),
	],
).enableRLS();

export const committeeDivisions = pgTable(
	"committee_divisions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		committeeId: uuid("committee_id")
			.notNull()
			.references(() => committees.id),
		name: text("name").notNull(),
	},
	(t) => [
		check(
			"committee_divisions_name_nonblank",
			sql`length(btrim(${t.name})) > 0`,
		),
		uniqueIndex("committee_divisions_committee_name_idx").on(
			t.committeeId,
			sql`lower(btrim(${t.name}))`,
		),
		// PostgreSQL requires an exact unique target for the membership's composite FK.
		unique("committee_divisions_committee_id_id_key").on(t.committeeId, t.id),
	],
).enableRLS();

export const committeeMembers = pgTable(
	"committee_members",
	{
		committeeId: uuid("committee_id")
			.notNull()
			.references(() => committees.id),
		userId: text("user_id")
			.notNull()
			.references(() => srProfiles.userId),
		divisionId: uuid("division_id").notNull(),
		positionCode: text("position_code")
			.$type<(typeof committeePositionCodes)[number]>()
			.notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.committeeId, t.userId] }),
		foreignKey({
			name: "committee_members_committee_division_fkey",
			columns: [t.committeeId, t.divisionId],
			foreignColumns: [committeeDivisions.committeeId, committeeDivisions.id],
		}),
		check(
			"committee_members_position_code",
			sql`${t.positionCode} IN ('ANGGOTA', 'SEKDEP', 'KADEP', 'SEKRE', 'BENDAHARA', 'PIC1', 'PIC2', 'PJ')`,
		),
		index("committee_members_user_idx").on(t.userId),
		index("committee_members_division_idx").on(t.committeeId, t.divisionId),
	],
).enableRLS();

export const committeeRelations = defineRelationsPart(
	{ committees, committeeDivisions, committeeMembers, user, srProfiles },
	(r) => ({
		committees: {
			creator: r.one.user({
				from: r.committees.createdByUserId,
				to: r.user.id,
				optional: false,
			}),
			divisions: r.many.committeeDivisions({
				from: r.committees.id,
				to: r.committeeDivisions.committeeId,
			}),
			members: r.many.committeeMembers({
				from: r.committees.id,
				to: r.committeeMembers.committeeId,
			}),
		},
		committeeDivisions: {
			committee: r.one.committees({
				from: r.committeeDivisions.committeeId,
				to: r.committees.id,
				optional: false,
			}),
			members: r.many.committeeMembers({
				from: r.committeeDivisions.id,
				to: r.committeeMembers.divisionId,
			}),
		},
		committeeMembers: {
			committee: r.one.committees({
				from: r.committeeMembers.committeeId,
				to: r.committees.id,
				optional: false,
			}),
			division: r.one.committeeDivisions({
				from: r.committeeMembers.divisionId,
				to: r.committeeDivisions.id,
				optional: false,
			}),
			sr: r.one.srProfiles({
				from: r.committeeMembers.userId,
				to: r.srProfiles.userId,
				optional: false,
			}),
		},
	}),
);
