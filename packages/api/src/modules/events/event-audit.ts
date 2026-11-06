import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import type { RosterCriteria } from "@resora/db/schema/attendance";
import {
	eventAuditLogs,
	eventDeletionAudits,
	events,
} from "@resora/db/schema/attendance";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import type { z } from "zod";
import {
	administrativeHistorySchema,
	eventAuditHistorySchema,
} from "../../contracts/attendance";
import {
	getUserDisplayNames,
	hasSuperadminPrivilege,
} from "../identity/identity.public";

type AuditState = typeof eventAuditLogs.$inferSelect.beforeState;
type AuditValue = string | number | null;

// Explicit business-field projection: never return stored JSON or participant IDs.
export function administrativeChanges(before: AuditState, after: AuditState) {
	const changes: { field: string; before: AuditValue; after: AuditValue }[] =
		[];
	const add = (field: string, previous: AuditValue, next: AuditValue) => {
		if (previous !== next)
			changes.push({ field, before: previous, after: next });
	};
	if ("visibility" in before && "visibility" in after) {
		add("visibility", before.visibility, after.visibility);
	} else if ("title" in before && "title" in after) {
		for (const field of ["title", "description", "startsAt", "endsAt"] as const)
			add(field, before[field], after[field]);
		for (const field of [
			"geofenceRadiusM",
			"lateGraceMinutes",
			"qrTtlMinutes",
		] as const) {
			add(
				field,
				before.session?.[field] ?? null,
				after.session?.[field] ?? null,
			);
		}
		if (
			before.session &&
			after.session &&
			(before.session.centerLat !== after.session.centerLat ||
				before.session.centerLng !== after.session.centerLng)
		) {
			add("location", "Titik sebelumnya", "Titik diperbarui");
		}

		if (before.rosterCriteria && after.rosterCriteria) {
			const summary = (criteria: RosterCriteria) =>
				[
					criteria.allSr ? "Semua SR aktif" : "",
					criteria.inti ? "INTI" : "",
					criteria.kadep ? "KADEP lintas departemen" : "",
					criteria.departments.length
						? `Departemen: ${[...criteria.departments].sort().join(", ")}`
						: "",
					`Pilihan individu: ${new Set([...criteria.individuals, ...criteria.include]).size}`,
					`Dikecualikan: ${new Set(criteria.exclude).size}`,
				]
					.filter(Boolean)
					.join("; ");
			add(
				"roster",
				summary(before.rosterCriteria),
				summary(after.rosterCriteria),
			);
		}
	}
	const participants =
		"participants" in before &&
		"participants" in after &&
		before.participants &&
		after.participants
			? {
					beforeCount: before.participants.count,
					afterCount: after.participants.count,
					addedCount: after.participants.addedUserIds?.length ?? 0,
					removedCount: after.participants.removedUserIds?.length ?? 0,
				}
			: null;
	return { changes, participants };
}

async function readeventAuditHistory(
	db: Database | DatabaseTransaction,
	identity: ActiveIdentity,
	input: z.input<typeof eventAuditHistorySchema>,
) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const { eventId, limit, offset } = eventAuditHistorySchema.parse(input);
	const [event] = await db
		.select({ id: events.id })
		.from(events)
		.where(eq(events.id, eventId));
	if (!event) throw new TRPCError({ code: "NOT_FOUND" });
	const rows = await db
		.select({
			id: eventAuditLogs.id,
			action: eventAuditLogs.action,
			actorUserId: eventAuditLogs.actorUserId,
			createdAt: eventAuditLogs.createdAt,
			reason: eventAuditLogs.reason,
			before: eventAuditLogs.beforeState,
			after: eventAuditLogs.afterState,
		})
		.from(eventAuditLogs)
		.where(eq(eventAuditLogs.eventId, eventId))
		.orderBy(desc(eventAuditLogs.createdAt), desc(eventAuditLogs.id))
		.limit(limit + 1)
		.offset(offset);
	const names = await getUserDisplayNames(
		db,
		rows.map((row) => row.actorUserId),
	);
	return {
		hasMore: rows.length > limit,
		items: rows
			.slice(0, limit)
			.map(({ before, after, actorUserId, ...row }) => ({
				...row,
				operator: names.get(actorUserId) ?? "",
				...administrativeChanges(before, after),
			})),
	};
}

async function readdeletedDraftHistory(
	db: Database | DatabaseTransaction,
	identity: ActiveIdentity,
	input: z.input<typeof administrativeHistorySchema>,
) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const { limit, offset } = administrativeHistorySchema.parse(input);
	const rows = await db
		.select({
			id: eventDeletionAudits.id,
			eventId: eventDeletionAudits.eventId,
			actorUserId: eventDeletionAudits.actorUserId,
			reason: eventDeletionAudits.reason,
			createdAt: eventDeletionAudits.createdAt,
			snapshot: eventDeletionAudits.eventSnapshot,
		})
		.from(eventDeletionAudits)
		.orderBy(desc(eventDeletionAudits.createdAt), desc(eventDeletionAudits.id))
		.limit(limit + 1)
		.offset(offset);
	const names = await getUserDisplayNames(
		db,
		rows.map((row) => row.actorUserId),
	);
	return {
		hasMore: rows.length > limit,
		items: rows.slice(0, limit).map(({ snapshot, actorUserId, ...row }) => ({
			...row,
			operator: names.get(actorUserId) ?? "",
			title: snapshot.title,
			startsAt: snapshot.startsAt,
			endsAt: snapshot.endsAt,
		})),
	};
}

export async function eventAuditHistory(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof eventAuditHistorySchema>,
) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	return db.transaction((tx) => readeventAuditHistory(tx, identity, input), {
		isolationLevel: "repeatable read",
		accessMode: "read only",
	});
}

export async function deletedDraftHistory(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof administrativeHistorySchema>,
) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	return db.transaction((tx) => readdeletedDraftHistory(tx, identity, input), {
		isolationLevel: "repeatable read",
		accessMode: "read only",
	});
}
