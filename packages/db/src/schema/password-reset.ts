import { sql } from "drizzle-orm";
import {
	check,
	index,
	inet,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const passwordResetAudit = pgTable.withRLS(
	"password_reset_audit",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id").references(() => user.id),
		targetEmail: text("target_email").notNull(),
		eventType: text("event_type")
			.$type<
				| "REQUESTED"
				| "SMTP_ACCEPTED"
				| "SMTP_FAILED"
				| "MANUAL_LINK_ISSUED"
				| "RESET_COMPLETED"
			>()
			.notNull(),
		source: text("source").$type<"PUBLIC" | "MANUAL">().notNull(),
		requestIp: inet("request_ip"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		errorCode: text("error_code"),
	},
	(t) => [
		index("password_reset_audit_user_created_idx").on(t.userId, t.createdAt),
		check(
			"password_reset_audit_event",
			sql`${t.eventType} IN ('REQUESTED','SMTP_ACCEPTED','SMTP_FAILED','MANUAL_LINK_ISSUED','RESET_COMPLETED')`,
		),
		check(
			"password_reset_audit_source",
			sql`${t.source} IN ('PUBLIC','MANUAL')`,
		),
		check(
			"password_reset_audit_email",
			sql`length(btrim(${t.targetEmail})) > 0`,
		),
		check(
			"password_reset_audit_error",
			sql`${t.errorCode} IS NULL OR ${t.errorCode} IN ('SMTP_CONFIG','SMTP_AUTH','SMTP_CONNECT','SMTP_TLS','SMTP_SEND')`,
		),
	],
);
