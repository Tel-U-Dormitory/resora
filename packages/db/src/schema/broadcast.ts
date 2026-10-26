import { defineRelationsPart, sql } from "drizzle-orm";
import {
	check,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const broadcasts = pgTable(
	"broadcasts",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		title: text("title").notNull(),
		content: text("content").notNull(),
		linkUrl: text("link_url"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		updatedByUserId: text("updated_by_user_id").references(() => user.id),
		publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		check(
			"broadcasts_title_valid",
			sql`${t.title} = btrim(${t.title}) AND char_length(${t.title}) BETWEEN 1 AND 150`,
		),
		check(
			"broadcasts_content_valid",
			sql`${t.content} = btrim(${t.content}) AND char_length(${t.content}) BETWEEN 1 AND 5000`,
		),
		check(
			"broadcasts_link_valid",
			sql`${t.linkUrl} IS NULL OR (char_length(${t.linkUrl}) <= 2048 AND ${t.linkUrl} ~* '^https?://[^[:space:]]+$')`,
		),
		check(
			"broadcasts_expiry_valid",
			sql`${t.expiresAt} > ${t.publishedAt} AND ${t.expiresAt} <= ${t.publishedAt} + interval '168 hours'`,
		),
		index("broadcasts_published_idx").on(t.publishedAt.desc(), t.id.desc()),
		index("broadcasts_active_expiry_idx")
			.on(t.expiresAt)
			.where(sql`${t.archivedAt} IS NULL`),
		index("broadcasts_creator_idx").on(t.createdByUserId),
		index("broadcasts_editor_idx").on(t.updatedByUserId),
	],
).enableRLS();

export const broadcastRelations = defineRelationsPart(
	{ broadcasts, user },
	(r) => ({
		broadcasts: {
			creator: r.one.user({
				from: r.broadcasts.createdByUserId,
				to: r.user.id,
				optional: false,
			}),
			editor: r.one.user({ from: r.broadcasts.updatedByUserId, to: r.user.id }),
		},
	}),
);
