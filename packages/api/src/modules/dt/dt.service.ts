import type { AuthConfig } from "@resora/auth";
import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import {
	dtAssignmentHistories,
	dtAudits,
	dtMemberships,
} from "@resora/db/schema/dt";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { z } from "zod";
import {
	findExistingIdentityByNimOrEmail,
	getActiveBuilding,
	getActiveBuildings,
	getDtAccountIdentities,
	getLiveOperationalIdentity,
	getUserDisplayNames,
	issueDtTemporaryPassword,
	provisionDtUser,
	revokeUserSessions,
} from "../identity/identity.public";
import {
	type activateDtMembershipSchema,
	type archiveDtMembershipSchema,
	computeEffectiveDtStatus,
	type endDtMembershipSchema,
	type extendDtPeriodSchema,
	jakartaTodayDateString,
	type listDtMembersSchema,
	type registerDtCandidateSchema,
	type rejectDtCandidateSchema,
	type updateDtAssignmentSchema,
} from "./dt.contracts";
import { authorizeDtManager } from "./dt-policy";

function requireManager(identity: ActiveIdentity | null | undefined) {
	if (!authorizeDtManager(identity)) {
		throw new TRPCError({ code: "FORBIDDEN", message: "DT_ACCESS_DENIED" });
	}
}

async function lockMembership(
	tx: DatabaseTransaction,
	membershipId: string,
	mode: "share" | "update" = "update",
) {
	const [row] = await tx
		.select()
		.from(dtMemberships)
		.where(eq(dtMemberships.id, membershipId))
		.for(mode);
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "DT_MEMBERSHIP_NOT_FOUND",
		});
	}
	return row;
}

async function validateBuildingReference(
	tx: DatabaseTransaction,
	buildingId: string | null | undefined,
) {
	if (!buildingId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "DT_BUILDING_REQUIRED",
		});
	}
	const bldg = await getActiveBuilding(tx, buildingId, true);
	if (!bldg) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "DT_INVALID_BUILDING",
		});
	}
	return bldg.id;
}

function assignmentSnapshot(row: {
	buildingId: string | null;
	workProgram: string | null;
}) {
	return {
		buildingId: row.buildingId,
		workProgram: row.workProgram,
	};
}

async function withManagerWrite<T>(
	db: Database,
	identity: ActiveIdentity,
	membershipId: string | null,
	action: (
		tx: DatabaseTransaction,
		live: ActiveIdentity,
		existing: typeof dtMemberships.$inferSelect | null,
	) => Promise<T>,
) {
	requireManager(identity);
	try {
		return await db.transaction(async (tx) => {
			const existing = membershipId
				? await lockMembership(tx, membershipId, "update")
				: null;
			const live = await getLiveOperationalIdentity(tx, identity.userId);
			requireManager(live);
			if (!live) {
				throw new TRPCError({ code: "FORBIDDEN", message: "DT_ACCESS_DENIED" });
			}
			return await action(tx, live, existing);
		});
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		const failure = error as { code?: string; cause?: { code?: string } };
		const code = failure.code ?? failure.cause?.code;
		if (code === "23505") {
			throw new TRPCError({ code: "CONFLICT", message: "DT_DUPLICATE_STATE" });
		}
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "DT_REQUEST_FAILED",
		});
	}
}

export async function getDtReferences(db: Database, identity: ActiveIdentity) {
	requireManager(identity);
	const buildings = await getActiveBuildings(db);
	return { buildings };
}

export type EnrichedDtMembership = {
	id: string;
	userId: string;
	name: string;
	nim: string;
	email: string;
	accountActive: boolean;
	periodName: string;
	status: typeof dtMemberships.$inferSelect.status;
	effectiveStatus: ReturnType<typeof computeEffectiveDtStatus>;
	startsOn: string | null;
	endsOn: string | null;
	buildingId: string | null;
	buildingCode: string | null;
	buildingName: string | null;
	workProgram: string | null;
	registrationNotes: string;
	decisionReason: string | null;
	endedReason: string | null;
	reviewedAt: Date | null;
	endedAt: Date | null;
	archivedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

export async function enrichDtMemberships(
	db: Database | DatabaseTransaction,
	rows: (typeof dtMemberships.$inferSelect)[],
): Promise<EnrichedDtMembership[]> {
	if (!rows.length) return [];
	const [accounts, buildings] = await Promise.all([
		getDtAccountIdentities(
			db,
			rows.map((r) => r.userId),
		),
		getActiveBuildings(db),
	]);
	const accountById = new Map(accounts.map((a) => [a.userId, a]));
	const bldgById = new Map(buildings.map((b) => [b.id, b]));
	const today = jakartaTodayDateString();
	return rows.map((row) => {
		const account = accountById.get(row.userId);
		const bldg = row.buildingId ? bldgById.get(row.buildingId) : undefined;
		return {
			id: row.id,
			userId: row.userId,
			name: account?.name ?? "Pengguna tidak ditemukan",
			nim: account?.nim ?? "",
			email: account?.email ?? "",
			accountActive: account?.isActive ?? false,
			periodName: row.periodName,
			status: row.status,
			effectiveStatus: computeEffectiveDtStatus(row, today),
			startsOn: row.startsOn,
			endsOn: row.endsOn,
			buildingId: row.buildingId,
			buildingCode: bldg?.code ?? null,
			buildingName: bldg?.name ?? null,
			workProgram: row.workProgram,
			registrationNotes: row.registrationNotes,
			decisionReason: row.decisionReason,
			endedReason: row.endedReason,
			reviewedAt: row.reviewedAt,
			endedAt: row.endedAt,
			archivedAt: row.archivedAt,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	});
}

export async function listDtMembers(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof listDtMembersSchema>,
) {
	requireManager(identity);
	const rows = await db
		.select()
		.from(dtMemberships)
		.orderBy(desc(dtMemberships.createdAt), desc(dtMemberships.id));
	const enriched = await enrichDtMemberships(db, rows);

	const periodOptions = [
		...new Set(enriched.map((item) => item.periodName)),
	].sort((a, b) => a.localeCompare(b, "id"));

	const searchTerm = input.search.trim().toLowerCase();
	const filtered = enriched.filter((item) => {
		if (
			searchTerm &&
			!`${item.name} ${item.nim} ${item.email} ${item.workProgram ?? ""}`
				.toLowerCase()
				.includes(searchTerm)
		) {
			return false;
		}
		if (input.periodName && item.periodName !== input.periodName) {
			return false;
		}
		if (input.buildingId && item.buildingId !== input.buildingId) {
			return false;
		}
		if (input.status && item.effectiveStatus !== input.status) {
			return false;
		}
		return true;
	});

	const counts = {
		total: enriched.length,
		candidate: enriched.filter((i) => i.effectiveStatus === "CANDIDATE").length,
		active: enriched.filter((i) => i.effectiveStatus === "ACTIVE").length,
		expired: enriched.filter((i) => i.effectiveStatus === "EXPIRED").length,
		ended: enriched.filter((i) => i.effectiveStatus === "ENDED").length,
		rejected: enriched.filter((i) => i.effectiveStatus === "REJECTED").length,
		archived: enriched.filter((i) => i.effectiveStatus === "ARCHIVED").length,
	};

	return {
		items: filtered.slice(input.offset, input.offset + input.limit),
		total: filtered.length,
		counts,
		periodOptions,
	};
}

export async function getDtMembershipCore(
	db: Database | DatabaseTransaction,
	membershipId: string,
) {
	const [row] = await db
		.select()
		.from(dtMemberships)
		.where(eq(dtMemberships.id, membershipId));
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "DT_MEMBERSHIP_NOT_FOUND",
		});
	}
	const [enriched] = await enrichDtMemberships(db, [row]);
	if (!enriched) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "DT_MEMBERSHIP_NOT_FOUND",
		});
	}
	const [assignments, audits, buildings, userPeriods] = await Promise.all([
		db
			.select()
			.from(dtAssignmentHistories)
			.where(eq(dtAssignmentHistories.membershipId, membershipId))
			.orderBy(desc(dtAssignmentHistories.effectiveFrom)),
		db
			.select()
			.from(dtAudits)
			.where(eq(dtAudits.membershipId, membershipId))
			.orderBy(desc(dtAudits.createdAt)),
		getActiveBuildings(db),
		db
			.select()
			.from(dtMemberships)
			.where(eq(dtMemberships.userId, row.userId))
			.orderBy(desc(dtMemberships.createdAt)),
	]);

	const actorIds = [
		row.registeredByUserId,
		row.reviewedByUserId,
		row.endedByUserId,
		row.archivedByUserId,
		...assignments.map((a) => a.assignedByUserId),
		...audits.map((a) => a.actorUserId),
	].filter((id): id is string => Boolean(id));
	const actorNames = await getUserDisplayNames(db, actorIds);
	const bldgById = new Map(buildings.map((b) => [b.id, b.name]));
	const today = jakartaTodayDateString();

	return {
		membership: {
			...enriched,
			registeredByName: actorNames.get(row.registeredByUserId) ?? "Pengelola",
			reviewedByName: row.reviewedByUserId
				? (actorNames.get(row.reviewedByUserId) ?? "Pengelola")
				: null,
			endedByName: row.endedByUserId
				? (actorNames.get(row.endedByUserId) ?? "Pengelola")
				: null,
			archivedByName: row.archivedByUserId
				? (actorNames.get(row.archivedByUserId) ?? "Pengelola")
				: null,
		},
		assignmentHistory: assignments.map((a) => ({
			id: a.id,
			buildingId: a.buildingId,
			buildingName: a.buildingId ? (bldgById.get(a.buildingId) ?? null) : null,
			workProgram: a.workProgram,
			reason: a.reason,
			assignedByName: actorNames.get(a.assignedByUserId) ?? "Pengelola",
			effectiveFrom: a.effectiveFrom,
			effectiveTo: a.effectiveTo,
		})),
		periodHistory: userPeriods.map((p) => ({
			id: p.id,
			periodName: p.periodName,
			status: p.status,
			effectiveStatus: computeEffectiveDtStatus(p, today),
			startsOn: p.startsOn,
			endsOn: p.endsOn,
			buildingName: p.buildingId ? (bldgById.get(p.buildingId) ?? null) : null,
			workProgram: p.workProgram,
			createdAt: p.createdAt,
		})),
		audits: audits.map((a) => ({
			id: a.id,
			action: a.action,
			reason: a.reason,
			actorName: actorNames.get(a.actorUserId) ?? "Pengelola",
			beforeState: a.beforeState,
			afterState: a.afterState,
			createdAt: a.createdAt,
		})),
	};
}

export async function getOwnDtMembershipRecords(db: Database, userId: string) {
	const memberships = await db
		.select()
		.from(dtMemberships)
		.where(eq(dtMemberships.userId, userId))
		.orderBy(desc(dtMemberships.createdAt));
	const enriched = await enrichDtMemberships(db, memberships);
	const assignments = await db
		.select()
		.from(dtAssignmentHistories)
		.where(eq(dtAssignmentHistories.userId, userId))
		.orderBy(desc(dtAssignmentHistories.effectiveFrom));
	const buildings = await getActiveBuildings(db);
	const bldgById = new Map(buildings.map((b) => [b.id, b.name]));
	return {
		memberships: enriched,
		assignmentHistory: assignments.map((a) => ({
			id: a.id,
			membershipId: a.membershipId,
			buildingId: a.buildingId,
			buildingName: a.buildingId ? (bldgById.get(a.buildingId) ?? null) : null,
			workProgram: a.workProgram,
			reason: a.reason,
			effectiveFrom: a.effectiveFrom,
			effectiveTo: a.effectiveTo,
		})),
	};
}

export async function registerDtCandidate(
	db: Database,
	identity: ActiveIdentity,
	authConfig: AuthConfig | undefined,
	input: z.infer<typeof registerDtCandidateSchema>,
) {
	if (!authConfig) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	return withManagerWrite(db, identity, null, async (tx, live) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtext('resora:dt-provisioning'))`,
		);
		const validBuildingId = await validateBuildingReference(tx, input.buildingId);
		const matches = await findExistingIdentityByNimOrEmail(
			tx,
			input.nim,
			input.email,
		);
		let targetUserId: string | null = null;
		const nimMatch = matches.find((row) => row.nim === input.nim);
		const emailMatch = matches.find(
			(row) => row.email.toLowerCase() === input.email,
		);
		if (nimMatch) {
			if (nimMatch.actor !== "DT") {
				throw new TRPCError({
					code: "CONFLICT",
					message: "DT_NIM_USED_BY_OTHER_ACTOR",
				});
			}
			if (emailMatch && emailMatch.userId !== nimMatch.userId) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "DT_EMAIL_EXISTS",
				});
			}
			const existingOpen = await tx
				.select({ id: dtMemberships.id, status: dtMemberships.status })
				.from(dtMemberships)
				.where(eq(dtMemberships.userId, nimMatch.userId));
			if (
				existingOpen.some(
					(m) => m.status === "CANDIDATE" || m.status === "ACTIVE",
				)
			) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "DT_ACTIVE_OR_CANDIDATE_EXISTS",
				});
			}
			targetUserId = nimMatch.userId;
		} else {
			if (emailMatch) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "DT_EMAIL_EXISTS",
				});
			}
			targetUserId = await provisionDtUser(tx, authConfig, {
				name: input.name,
				nim: input.nim,
				email: input.email,
			});
		}

		const [created] = await tx
			.insert(dtMemberships)
			.values({
				userId: targetUserId,
				periodName: input.periodName,
				status: "CANDIDATE",
				departmentCode: null,
				buildingId: validBuildingId,
				workProgram: input.workProgram ?? null,
				registrationNotes: input.registrationNotes,
				registeredByUserId: live.userId,
			})
			.returning();
		if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

		await tx.insert(dtAudits).values({
			membershipId: created.id,
			targetUserId,
			actorUserId: live.userId,
			action: "CANDIDATE_REGISTERED",
			reason: "Pendaftaran calon anggota DT",
			beforeState: null,
			afterState: {
				status: created.status,
				periodName: created.periodName,
				...assignmentSnapshot(created),
			},
		});

		return { membershipId: created.id, userId: targetUserId };
	});
}

export async function activateDtMembership(
	db: Database,
	identity: ActiveIdentity,
	authConfig: AuthConfig | undefined,
	input: z.infer<typeof activateDtMembershipSchema>,
) {
	if (!authConfig) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	return withManagerWrite(
		db,
		identity,
		input.membershipId,
		async (tx, live, existing) => {
			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "DT_MEMBERSHIP_NOT_FOUND",
				});
			}
			if (existing.status !== "CANDIDATE") {
				throw new TRPCError({
					code: "CONFLICT",
					message: "DT_NOT_CANDIDATE",
				});
			}
			const nextBldg =
				input.buildingId !== undefined ? input.buildingId : existing.buildingId;
			const nextWorkProgram =
				input.workProgram !== undefined
					? input.workProgram
					: existing.workProgram;
			const validBuildingId = await validateBuildingReference(tx, nextBldg);
			const nextPeriodName = input.periodName ?? existing.periodName;
			const now = new Date();

			const { temporaryPassword } = await issueDtTemporaryPassword(
				tx,
				authConfig,
				existing.userId,
				false,
			);

			const [updated] = await tx
				.update(dtMemberships)
				.set({
					status: "ACTIVE",
					periodName: nextPeriodName,
					startsOn: input.startsOn,
					endsOn: input.endsOn,
					departmentCode: null,
					buildingId: validBuildingId,
					workProgram: nextWorkProgram ?? null,
					reviewedByUserId: live.userId,
					reviewedAt: now,
					decisionReason: input.reason,
				})
				.where(eq(dtMemberships.id, existing.id))
				.returning();
			if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

			await tx.insert(dtAssignmentHistories).values({
				membershipId: updated.id,
				userId: existing.userId,
				departmentCode: null,
				buildingId: validBuildingId,
				workProgram: nextWorkProgram ?? null,
				reason: input.reason,
				assignedByUserId: live.userId,
				effectiveFrom: now,
			});

			await tx.insert(dtAudits).values({
				membershipId: updated.id,
				targetUserId: existing.userId,
				actorUserId: live.userId,
				action: "MEMBERSHIP_ACTIVATED",
				reason: input.reason,
				beforeState: {
					status: existing.status,
					periodName: existing.periodName,
				},
				afterState: {
					status: updated.status,
					periodName: updated.periodName,
					startsOn: updated.startsOn,
					endsOn: updated.endsOn,
					...assignmentSnapshot(updated),
				},
			});

			const [account] = await getDtAccountIdentities(tx, [existing.userId]);
			return {
				membershipId: updated.id,
				name: account?.name ?? "",
				nim: account?.nim ?? "",
				email: account?.email ?? "",
				temporaryPassword,
			};
		},
	);
}

export async function rejectDtCandidate(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof rejectDtCandidateSchema>,
) {
	return withManagerWrite(
		db,
		identity,
		input.membershipId,
		async (tx, live, existing) => {
			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "DT_MEMBERSHIP_NOT_FOUND",
				});
			}
			if (existing.status !== "CANDIDATE") {
				throw new TRPCError({
					code: "CONFLICT",
					message: "DT_NOT_CANDIDATE",
				});
			}
			const now = new Date();
			const [updated] = await tx
				.update(dtMemberships)
				.set({
					status: "REJECTED",
					reviewedByUserId: live.userId,
					reviewedAt: now,
					decisionReason: input.reason,
				})
				.where(eq(dtMemberships.id, existing.id))
				.returning();
			if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

			await tx.insert(dtAudits).values({
				membershipId: updated.id,
				targetUserId: existing.userId,
				actorUserId: live.userId,
				action: "MEMBERSHIP_REJECTED",
				reason: input.reason,
				beforeState: { status: existing.status },
				afterState: { status: updated.status },
			});
			return { membershipId: updated.id };
		},
	);
}

export async function extendDtPeriod(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof extendDtPeriodSchema>,
) {
	return withManagerWrite(
		db,
		identity,
		input.membershipId,
		async (tx, live, existing) => {
			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "DT_MEMBERSHIP_NOT_FOUND",
				});
			}
			if (existing.status !== "ACTIVE" || !existing.endsOn) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "DT_NOT_EXTENDABLE",
				});
			}
			if (input.endsOn <= existing.endsOn) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "DT_PERIOD_MUST_EXTEND",
				});
			}
			const nextPeriodName = input.periodName ?? existing.periodName;
			const [updated] = await tx
				.update(dtMemberships)
				.set({
					endsOn: input.endsOn,
					periodName: nextPeriodName,
				})
				.where(eq(dtMemberships.id, existing.id))
				.returning();
			if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

			await tx.insert(dtAudits).values({
				membershipId: updated.id,
				targetUserId: existing.userId,
				actorUserId: live.userId,
				action: "PERIOD_EXTENDED",
				reason: input.reason,
				beforeState: {
					periodName: existing.periodName,
					endsOn: existing.endsOn,
				},
				afterState: {
					periodName: updated.periodName,
					endsOn: updated.endsOn,
				},
			});
			return { membershipId: updated.id, endsOn: updated.endsOn };
		},
	);
}

export async function endDtMembership(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof endDtMembershipSchema>,
) {
	return withManagerWrite(
		db,
		identity,
		input.membershipId,
		async (tx, live, existing) => {
			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "DT_MEMBERSHIP_NOT_FOUND",
				});
			}
			if (existing.status !== "ACTIVE") {
				throw new TRPCError({
					code: "CONFLICT",
					message: "DT_NOT_ACTIVE",
				});
			}
			const now = new Date();
			const [updated] = await tx
				.update(dtMemberships)
				.set({
					status: "ENDED",
					endedByUserId: live.userId,
					endedAt: now,
					endedReason: input.reason,
				})
				.where(eq(dtMemberships.id, existing.id))
				.returning();
			if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

			await tx
				.update(dtAssignmentHistories)
				.set({ effectiveTo: now })
				.where(
					and(
						eq(dtAssignmentHistories.membershipId, existing.id),
						isNull(dtAssignmentHistories.effectiveTo),
					),
				);

			await revokeUserSessions(tx, existing.userId);

			await tx.insert(dtAudits).values({
				membershipId: updated.id,
				targetUserId: existing.userId,
				actorUserId: live.userId,
				action: "MEMBERSHIP_ENDED",
				reason: input.reason,
				beforeState: {
					status: existing.status,
					endsOn: existing.endsOn,
				},
				afterState: {
					status: updated.status,
					endedAt: now.toISOString(),
				},
			});
			return { membershipId: updated.id };
		},
	);
}

export async function archiveDtMembership(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof archiveDtMembershipSchema>,
) {
	return withManagerWrite(
		db,
		identity,
		input.membershipId,
		async (tx, live, existing) => {
			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "DT_MEMBERSHIP_NOT_FOUND",
				});
			}
			const effective = computeEffectiveDtStatus(existing);
			if (
				effective !== "ENDED" &&
				effective !== "EXPIRED" &&
				effective !== "REJECTED"
			) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "DT_ARCHIVE_REQUIRES_INACTIVE",
				});
			}
			const now = new Date();
			const [updated] = await tx
				.update(dtMemberships)
				.set({
					status: "ARCHIVED",
					archivedByUserId: live.userId,
					archivedAt: now,
					...(existing.status === "ACTIVE"
						? {
								endedByUserId: live.userId,
								endedAt: now,
								endedReason: input.reason,
							}
						: {}),
				})
				.where(eq(dtMemberships.id, existing.id))
				.returning();
			if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

			await tx
				.update(dtAssignmentHistories)
				.set({ effectiveTo: now })
				.where(
					and(
						eq(dtAssignmentHistories.membershipId, existing.id),
						isNull(dtAssignmentHistories.effectiveTo),
					),
				);

			await revokeUserSessions(tx, existing.userId);

			await tx.insert(dtAudits).values({
				membershipId: updated.id,
				targetUserId: existing.userId,
				actorUserId: live.userId,
				action: "MEMBERSHIP_ARCHIVED",
				reason: input.reason,
				beforeState: { status: existing.status, effectiveStatus: effective },
				afterState: { status: updated.status, archivedAt: now.toISOString() },
			});
			return { membershipId: updated.id };
		},
	);
}

export async function updateDtAssignment(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof updateDtAssignmentSchema>,
) {
	return withManagerWrite(
		db,
		identity,
		input.membershipId,
		async (tx, live, existing) => {
			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "DT_MEMBERSHIP_NOT_FOUND",
				});
			}
			if (existing.status !== "ACTIVE") {
				throw new TRPCError({
					code: "CONFLICT",
					message: "DT_NOT_ACTIVE",
				});
			}
			const nextBldg =
				input.buildingId !== undefined ? input.buildingId : existing.buildingId;
			const nextWorkProgram =
				input.workProgram !== undefined
					? input.workProgram
					: existing.workProgram;
			const validBuildingId = await validateBuildingReference(tx, nextBldg);
			const now = new Date();

			await tx
				.update(dtAssignmentHistories)
				.set({ effectiveTo: now })
				.where(
					and(
						eq(dtAssignmentHistories.membershipId, existing.id),
						isNull(dtAssignmentHistories.effectiveTo),
					),
				);

			await tx.insert(dtAssignmentHistories).values({
				membershipId: existing.id,
				userId: existing.userId,
				departmentCode: null,
				buildingId: validBuildingId,
				workProgram: nextWorkProgram ?? null,
				reason: input.reason,
				assignedByUserId: live.userId,
				effectiveFrom: now,
			});

			const [updated] = await tx
				.update(dtMemberships)
				.set({
					departmentCode: null,
					buildingId: validBuildingId,
					workProgram: nextWorkProgram ?? null,
				})
				.where(eq(dtMemberships.id, existing.id))
				.returning();
			if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

			await tx.insert(dtAudits).values({
				membershipId: updated.id,
				targetUserId: existing.userId,
				actorUserId: live.userId,
				action: "ASSIGNMENT_UPDATED",
				reason: input.reason,
				beforeState: assignmentSnapshot(existing),
				afterState: assignmentSnapshot(updated),
			});
			return { membershipId: updated.id };
		},
	);
}

export async function resetDtPassword(
	db: Database,
	identity: ActiveIdentity,
	authConfig: AuthConfig | undefined,
	membershipId: string,
) {
	if (!authConfig) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	return withManagerWrite(
		db,
		identity,
		membershipId,
		async (tx, live, existing) => {
			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "DT_MEMBERSHIP_NOT_FOUND",
				});
			}
			if (existing.status !== "ACTIVE") {
				throw new TRPCError({
					code: "CONFLICT",
					message: "DT_NOT_ACTIVE",
				});
			}
			const { temporaryPassword } = await issueDtTemporaryPassword(
				tx,
				authConfig,
				existing.userId,
				true,
			);
			await tx.insert(dtAudits).values({
				membershipId: existing.id,
				targetUserId: existing.userId,
				actorUserId: live.userId,
				action: "PASSWORD_RESET",
				reason: "Reset password akun DT oleh pengelola",
				beforeState: null,
				afterState: { reset: true },
			});
			const [account] = await getDtAccountIdentities(tx, [existing.userId]);
			return {
				membershipId: existing.id,
				name: account?.name ?? "",
				nim: account?.nim ?? "",
				email: account?.email ?? "",
				temporaryPassword,
			};
		},
	);
}

export type ActiveDtCandidate = {
	userId: string;
	nim: string;
	name: string;
	periodName: string;
	departmentCode: string | null;
	buildingId: string | null;
	buildingCode: string | null;
	buildingName: string | null;
	workProgram: string | null;
};

export async function readActiveDtDirectory(
	db: Database | DatabaseTransaction,
	lock = false,
	userId?: string,
): Promise<ActiveDtCandidate[]> {
	const today = sql`(statement_timestamp() AT TIME ZONE 'Asia/Jakarta')::date`;
	const query = db
		.select({
			userId: dtMemberships.userId,
			periodName: dtMemberships.periodName,
			departmentCode: dtMemberships.departmentCode,
			buildingId: dtMemberships.buildingId,
			workProgram: dtMemberships.workProgram,
		})
		.from(dtMemberships)
		.where(
			and(
				userId ? eq(dtMemberships.userId, userId) : undefined,
				eq(dtMemberships.status, "ACTIVE"),
				lte(dtMemberships.startsOn, today),
				gte(dtMemberships.endsOn, today),
			),
		);
	const rows = await (lock ? query.for("share") : query);
	if (!rows.length) return [];
	const [accounts, buildings] = await Promise.all([
		getDtAccountIdentities(
			db,
			rows.map((r) => r.userId),
		),
		getActiveBuildings(db),
	]);
	const accountById = new Map(accounts.map((a) => [a.userId, a]));
	const bldgById = new Map(buildings.map((b) => [b.id, b]));
	const result: ActiveDtCandidate[] = [];
	for (const row of rows) {
		const account = accountById.get(row.userId);
		const nim = account?.nim?.trim();
		if (!account?.isActive || account.actor !== "DT" || !nim) {
			continue;
		}
		const bldg = row.buildingId ? bldgById.get(row.buildingId) : undefined;
		result.push({
			userId: row.userId,
			nim,
			name: account.name,
			periodName: row.periodName,
			departmentCode: row.departmentCode,
			buildingId: row.buildingId,
			buildingCode: bldg?.code ?? null,
			buildingName: bldg?.name ?? null,
			workProgram: row.workProgram,
		});
	}
	return result.sort((a, b) => a.name.localeCompare(b.name, "id"));
}

export async function getAllDtUserIds(
	db: Database | DatabaseTransaction,
): Promise<Set<string>> {
	const rows = await db
		.selectDistinct({ userId: dtMemberships.userId })
		.from(dtMemberships);
	return new Set(rows.map((r) => r.userId));
}

export async function getLatestDtMembershipsByUserIds(
	db: Database | DatabaseTransaction,
	userIds: readonly string[],
) {
	if (!userIds.length) return new Map<string, EnrichedDtMembership>();
	const rows = await db
		.select()
		.from(dtMemberships)
		.where(inArray(dtMemberships.userId, [...new Set(userIds)]))
		.orderBy(desc(dtMemberships.createdAt), desc(dtMemberships.id));
	const enriched = await enrichDtMemberships(db, rows);
	const map = new Map<string, EnrichedDtMembership>();
	for (const item of enriched) {
		const prev = map.get(item.userId);
		if (!prev || (item.status === "ACTIVE" && prev.status !== "ACTIVE")) {
			map.set(item.userId, item);
		}
	}
	return map;
}

export async function syncAdminDtBuildingAssignment(
	tx: DatabaseTransaction,
	actorUserId: string,
	userId: string,
	buildingId: string,
) {
	const validBuildingId = await validateBuildingReference(tx, buildingId);
	const [membership] = await tx
		.select()
		.from(dtMemberships)
		.where(
			and(
				eq(dtMemberships.userId, userId),
				inArray(dtMemberships.status, ["ACTIVE", "CANDIDATE"]),
			),
		)
		.orderBy(desc(dtMemberships.createdAt))
		.limit(1)
		.for("update");
	if (!membership || membership.buildingId === validBuildingId) return;
	const now = new Date();
	if (membership.status === "ACTIVE") {
		await tx
			.update(dtAssignmentHistories)
			.set({ effectiveTo: now })
			.where(
				and(
					eq(dtAssignmentHistories.membershipId, membership.id),
					isNull(dtAssignmentHistories.effectiveTo),
				),
			);
		await tx.insert(dtAssignmentHistories).values({
			membershipId: membership.id,
			userId,
			departmentCode: null,
			buildingId: validBuildingId,
			workProgram: membership.workProgram,
			reason: "Pembaruan gedung oleh SUPERADMIN",
			assignedByUserId: actorUserId,
			effectiveFrom: now,
		});
	}
	const [updated] = await tx
		.update(dtMemberships)
		.set({ departmentCode: null, buildingId: validBuildingId })
		.where(eq(dtMemberships.id, membership.id))
		.returning();
	if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	await tx.insert(dtAudits).values({
		membershipId: updated.id,
		targetUserId: userId,
		actorUserId,
		action: "ASSIGNMENT_UPDATED",
		reason: "Pembaruan gedung oleh SUPERADMIN",
		beforeState: assignmentSnapshot(membership),
		afterState: assignmentSnapshot(updated),
	});
}
