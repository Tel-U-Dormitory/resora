import { randomBytes, randomUUID } from "node:crypto";
import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	violationsAudits,
	violationsReports,
	violationsUploadIntents,
} from "@resora/db/schema/violations";
import type { ObjectStorage } from "@resora/storage";
import { TRPCError } from "@trpc/server";
import {
	and,
	count,
	desc,
	eq,
	gte,
	ilike,
	isNotNull,
	isNull,
	lte,
	or,
	sql,
} from "drizzle-orm";
import type { z } from "zod";
import {
	getActiveBuilding,
	getActiveBuildings,
	getLiveOperationalIdentity,
	getUserDisplayNames,
	hasSuperadminPrivilege,
} from "../identity/identity.public";
import { validateKtmImage } from "./ktm-image";
import { matchesKtmImageSignature } from "./ktm-validation";
import type {
	createViolationSchema,
	updateViolationSchema,
	violationDeleteSchema,
	violationsHistorySchema,
	violationsListSchema,
	violationsStatisticsSchema,
	violationUploadIntentSchema,
} from "./violations.contracts";
import {
	canCreateViolation,
	canMutateViolation,
	canReadViolations,
	canSelectViolationBuilding,
} from "./violations-policy";
import { publicReport } from "./violations-presenter";

const reportFields = {
	id: violationsReports.id,
	publicCode: violationsReports.publicCode,
	studentName: violationsReports.studentName,
	studentNim: violationsReports.studentNim,
	incidentDate: violationsReports.incidentDate,
	description: violationsReports.description,
	reporterUserId: violationsReports.reporterUserId,
	recordedBuildingId: violationsReports.recordedBuildingId,
	recordedBuildingName: violationsReports.recordedBuildingName,
	ktmObjectKey: violationsReports.ktmObjectKey,
	version: violationsReports.version,
	recordedAt: violationsReports.recordedAt,
	updatedAt: violationsReports.updatedAt,
	deletedAt: violationsReports.deletedAt,
	deletedByUserId: violationsReports.deletedByUserId,
	deleteReason: violationsReports.deleteReason,
};

function fail(
	message: string,
	code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST",
): never {
	throw new TRPCError({ code, message });
}

function authorize(identity: ActiveIdentity | null, write = false) {
	if (!canReadViolations(identity) || (write && !identity))
		fail("VIOLATIONS_ACCESS_DENIED", "FORBIDDEN");
}

const maxKtmBytes = 10 * 1024 * 1024;
const codeAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function newPublicCode() {
	return `PLG-${Array.from(randomBytes(10), (byte) => codeAlphabet[byte & 31]).join("")}`;
}

async function copyValidatedKtm(
	storage: ObjectStorage,
	temporaryObjectKey: string,
	finalObjectKey: string,
	contentType: string,
) {
	const source = await storage.getPrivateObjectMetadata(temporaryObjectKey);
	if (
		!source?.size ||
		source.size > maxKtmBytes ||
		source.contentType !== contentType
	)
		fail("VIOLATION_KTM_INVALID", "BAD_REQUEST");
	const original = await storage.getPrivateObjectBytes(
		temporaryObjectKey,
		maxKtmBytes,
	);
	if (
		original.contentType !== contentType ||
		original.bytes.byteLength !== source.size ||
		!matchesKtmImageSignature(contentType, original.bytes)
	)
		fail("VIOLATION_KTM_INVALID", "BAD_REQUEST");
	const validated = await validateKtmImage(original.bytes, contentType).catch(
		() => fail("VIOLATION_KTM_INVALID", "BAD_REQUEST"),
	);
	await storage.copyPrivateObject(
		temporaryObjectKey,
		finalObjectKey,
		validated.contentType,
	);
	const stored = await storage.getPrivateObjectMetadata(finalObjectKey);
	if (
		!stored ||
		stored.size !== validated.sizeBytes ||
		stored.contentType !== validated.contentType
	)
		fail("VIOLATION_KTM_INVALID", "BAD_REQUEST");
	if (!matchesKtmImageSignature(validated.contentType, original.bytes))
		fail("VIOLATION_KTM_INVALID", "BAD_REQUEST");
	return { sizeBytes: stored.size, contentType: stored.contentType };
}
export async function createViolationUploadIntent(
	db: Database,
	storage: ObjectStorage | undefined,
	identity: ActiveIdentity,
	input: z.infer<typeof violationUploadIntentSchema>,
) {
	if (!storage)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "VIOLATIONS_STORAGE_UNAVAILABLE",
		});
	if (!canCreateViolation(identity))
		fail("VIOLATION_SR_REPORTER_REQUIRED", "FORBIDDEN");
	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (!live || !canCreateViolation(live))
			fail("VIOLATION_SR_REPORTER_REQUIRED", "FORBIDDEN");
		const id = randomUUID();
		const temporaryObjectKey = `violations/tmp/${randomUUID()}`;
		const result = await tx.execute<{ now: Date }>(
			sql`SELECT clock_timestamp() AS now`,
		);
		const now = new Date(result.rows[0]?.now ?? Number.NaN);
		if (!Number.isFinite(now.getTime()))
			throw Error("Database time unavailable");
		const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
		const upload = await storage.createPrivateUploadUrl(
			temporaryObjectKey,
			input.contentType,
		);
		await tx.insert(violationsUploadIntents).values({
			id,
			reporterUserId: live.userId,
			temporaryObjectKey,
			contentType: input.contentType,
			expiresAt,
		});
		return { uploadIntentId: id, upload, expiresAt };
	});
}

export async function violationBuildingOptions(
	db: Database,
	identity: ActiveIdentity,
) {
	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (!live || !canSelectViolationBuilding(live))
			fail("VIOLATIONS_ACCESS_DENIED", "FORBIDDEN");
		return getActiveBuildings(tx);
	});
}

export async function createViolation(
	db: Database,
	storage: ObjectStorage | undefined,
	identity: ActiveIdentity,
	input: z.infer<typeof createViolationSchema>,
) {
	if (!storage)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "VIOLATIONS_STORAGE_UNAVAILABLE",
		});
	if (!canCreateViolation(identity))
		fail("VIOLATION_SR_REPORTER_REQUIRED", "FORBIDDEN");
	let copiedKey: string | undefined;
	try {
		const preflight = await db.transaction(async (tx) => {
			const live = await getLiveOperationalIdentity(tx, identity.userId);
			if (!live || !canCreateViolation(live))
				fail("VIOLATION_SR_REPORTER_REQUIRED", "FORBIDDEN");
			const [intent] = await tx
				.select()
				.from(violationsUploadIntents)
				.where(
					and(
						eq(violationsUploadIntents.id, input.uploadIntentId),
						eq(violationsUploadIntents.reporterUserId, live.userId),
					),
				);
			const [existing] = await tx
				.select()
				.from(violationsReports)
				.where(
					and(
						eq(violationsReports.reporterUserId, live.userId),
						eq(violationsReports.idempotencyKey, input.idempotencyKey),
					),
				);
			if (existing) {
				if (
					intent?.resultObjectKey === existing.ktmObjectKey &&
					existing.studentName === input.studentName &&
					existing.studentNim === input.studentNim &&
					existing.incidentDate === input.incidentDate &&
					existing.description === input.description
				)
					return {
						replay: {
							reportId: existing.id,
							publicCode: existing.publicCode,
							recordedAt: existing.recordedAt,
							replayed: true,
						},
					};
				fail("VIOLATION_IDEMPOTENCY_CONFLICT", "BAD_REQUEST");
			}
			const nowResult = await tx.execute<{ now: Date }>(
				sql`SELECT clock_timestamp() AS now`,
			);
			const now = new Date(nowResult.rows[0]?.now ?? Number.NaN);
			if (!Number.isFinite(now.getTime()))
				throw Error("Database time unavailable");
			if (!intent || intent.consumedAt || intent.expiresAt <= now)
				fail("VIOLATION_UPLOAD_INTENT_INVALID", "BAD_REQUEST");
			return {
				temporaryObjectKey: intent.temporaryObjectKey,
				contentType: intent.contentType,
			};
		});
		if ("replay" in preflight) return preflight.replay;
		const finalKey = `violations/ktm/${randomUUID()}`;
		copiedKey = finalKey;
		const storedKtm = await copyValidatedKtm(
			storage,
			preflight.temporaryObjectKey,
			finalKey,
			preflight.contentType,
		);
		const response = await db.transaction(async (tx) => {
			const live = await getLiveOperationalIdentity(tx, identity.userId);
			if (!live || !canCreateViolation(live))
				fail("VIOLATION_SR_REPORTER_REQUIRED", "FORBIDDEN");
			const buildingId =
				live.actor === "SR" ? live.buildingId : input.confirmedBuildingId;
			const building = await getActiveBuilding(tx, buildingId, true);
			if (!building) fail("VIOLATIONS_BUILDING_UNAVAILABLE", "BAD_REQUEST");
			if (live.actor === "SR" && building.id !== input.confirmedBuildingId)
				fail("VIOLATION_BUILDING_CONFIRMATION_STALE", "BAD_REQUEST");
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${live.userId}:${input.idempotencyKey}`}, 0))`,
			);
			const [intent] = await tx
				.select()
				.from(violationsUploadIntents)
				.where(
					and(
						eq(violationsUploadIntents.id, input.uploadIntentId),
						eq(violationsUploadIntents.reporterUserId, live.userId),
					),
				)
				.for("update");
			const [existing] = await tx
				.select()
				.from(violationsReports)
				.where(
					and(
						eq(violationsReports.reporterUserId, live.userId),
						eq(violationsReports.idempotencyKey, input.idempotencyKey),
					),
				);
			if (existing) {
				if (
					intent?.resultObjectKey === existing.ktmObjectKey &&
					existing.studentName === input.studentName &&
					existing.studentNim === input.studentNim &&
					existing.incidentDate === input.incidentDate &&
					existing.description === input.description
				)
					return {
						reportId: existing.id,
						publicCode: existing.publicCode,
						recordedAt: existing.recordedAt,
						replayed: true,
					};
				fail("VIOLATION_IDEMPOTENCY_CONFLICT", "BAD_REQUEST");
			}
			const intentClock = await tx.execute<{ now: Date }>(
				sql`SELECT clock_timestamp() AS now`,
			);
			const intentNow = new Date(intentClock.rows[0]?.now ?? Number.NaN);
			if (!Number.isFinite(intentNow.getTime()))
				throw Error("Database time unavailable");
			if (!intent || intent.consumedAt || intent.expiresAt <= intentNow)
				fail("VIOLATION_UPLOAD_INTENT_INVALID", "BAD_REQUEST");
			const nowResult = await tx.execute<{ now: Date }>(
				sql`SELECT clock_timestamp() AS now`,
			);
			const recordedAt = new Date(nowResult.rows[0]?.now ?? Number.NaN);
			if (!Number.isFinite(recordedAt.getTime()))
				throw Error("Database time unavailable");
			const publicCode = newPublicCode();
			const [report] = await tx
				.insert(violationsReports)
				.values({
					publicCode,
					studentName: input.studentName,
					studentNim: input.studentNim,
					incidentDate: input.incidentDate,
					description: input.description,
					reporterUserId: live.userId,
					recordedBuildingId: building.id,
					recordedBuildingName: building.name,
					ktmObjectKey: finalKey,
					ktmContentType: storedKtm.contentType,
					ktmSizeBytes: storedKtm.sizeBytes,
					idempotencyKey: input.idempotencyKey,
					recordedAt,
					updatedAt: recordedAt,
				})
				.returning({ id: violationsReports.id });
			if (!report) throw Error("Violation report insert failed");
			await tx.insert(violationsAudits).values({
				reportId: report.id,
				actorUserId: live.userId,
				action: "CREATED",
				afterState: {
					publicCode,
					studentName: input.studentName,
					studentNim: input.studentNim,
					incidentDate: input.incidentDate,
					description: input.description,
					recordedBuildingId: building.id,
					recordedBuildingName: building.name,
					ktmAttached: true,
				},
			});
			await tx
				.update(violationsUploadIntents)
				.set({ consumedAt: recordedAt, resultObjectKey: finalKey })
				.where(eq(violationsUploadIntents.id, intent.id));
			return { reportId: report.id, publicCode, recordedAt, replayed: false };
		});
		if (response.replayed)
			await storage.deletePrivateObject(finalKey).catch(() => undefined);
		else
			await storage
				.deletePrivateObject(preflight.temporaryObjectKey)
				.catch(() => undefined);
		copiedKey = undefined;
		return response;
	} catch (error) {
		if (copiedKey)
			await storage.deletePrivateObject(copiedKey).catch(() => undefined);
		if (error instanceof TRPCError) throw error;
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "VIOLATION_CREATE_FAILED",
		});
	}
}

export async function listViolations(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof violationsListSchema>,
) {
	authorize(identity);
	return db.transaction(
		async (tx) => {
			const live = await getLiveOperationalIdentity(tx, identity.userId);
			authorize(live);
			if (!live) fail("VIOLATIONS_ACCESS_DENIED", "FORBIDDEN");
			const filter = and(
				input.view === "DELETED"
					? isNotNull(violationsReports.deletedAt)
					: isNull(violationsReports.deletedAt),
				input.buildingId
					? eq(violationsReports.recordedBuildingId, input.buildingId)
					: undefined,
				input.dateFrom
					? gte(violationsReports.incidentDate, input.dateFrom)
					: undefined,
				input.dateTo
					? lte(violationsReports.incidentDate, input.dateTo)
					: undefined,
				input.query && input.view === "ACTIVE"
					? or(
							ilike(violationsReports.studentName, `%${input.query}%`),
							ilike(violationsReports.studentNim, `%${input.query}%`),
						)
					: undefined,
			);
			const rows = await tx
				.select(reportFields)
				.from(violationsReports)
				.where(filter)
				.orderBy(
					desc(
						input.view === "DELETED"
							? violationsReports.deletedAt
							: violationsReports.incidentDate,
					),
					desc(violationsReports.recordedAt),
					desc(violationsReports.id),
				)
				.limit(input.limit)
				.offset(input.offset);
			const [total] = await tx
				.select({ total: count() })
				.from(violationsReports)
				.where(filter);
			const includeDeletedDetails = hasSuperadminPrivilege(live);
			const userIds = rows.flatMap((row) => [
				...(input.view === "ACTIVE" || includeDeletedDetails
					? [row.reporterUserId]
					: []),
				...(row.deletedByUserId ? [row.deletedByUserId] : []),
			]);
			const names = await getUserDisplayNames(tx, userIds);
			return {
				items: rows.map((row) => {
					const report = publicReport(
						row,
						names.get(row.reporterUserId) ?? null,
						includeDeletedDetails,
					);
					return {
						...report,
						deletedByName: row.deletedByUserId
							? (names.get(row.deletedByUserId) ?? null)
							: null,
					};
				}),
				total: total?.total ?? 0,
				limit: input.limit,
				offset: input.offset,
			};
		},
		{ isolationLevel: "repeatable read" },
	);
}

export async function violationDetail(
	db: Database,
	storage: ObjectStorage | undefined,
	identity: ActiveIdentity,
	reportId: string,
) {
	authorize(identity);
	return db.transaction(
		async (tx) => {
			const live = await getLiveOperationalIdentity(tx, identity.userId);
			authorize(live);
			if (!live) fail("VIOLATIONS_ACCESS_DENIED", "FORBIDDEN");
			const [row] = await tx
				.select(reportFields)
				.from(violationsReports)
				.where(eq(violationsReports.id, reportId));
			if (!row) fail("VIOLATION_NOT_FOUND", "NOT_FOUND");
			const includeDeletedDetails =
				row.deletedAt !== null && hasSuperadminPrivilege(live);
			const reporterName =
				row.deletedAt && !includeDeletedDetails
					? null
					: ((await getUserDisplayNames(tx, [row.reporterUserId])).get(
							row.reporterUserId,
						) ?? null);
			const base = publicReport(row, reporterName, includeDeletedDetails);
			if (row.deletedAt) {
				const deletedByName = row.deletedByUserId
					? ((await getUserDisplayNames(tx, [row.deletedByUserId])).get(
							row.deletedByUserId,
						) ?? null)
					: null;
				const ktm = includeDeletedDetails
					? await storage?.createPrivateDownloadUrl(row.ktmObjectKey)
					: null;
				return { ...base, deletedByName, ktm: ktm ?? null };
			}
			if (!storage)
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "VIOLATIONS_STORAGE_UNAVAILABLE",
				});
			const ktm = await storage.createPrivateDownloadUrl(row.ktmObjectKey);
			return { ...base, deletedByName: null, ktm };
		},
		{ isolationLevel: "repeatable read" },
	);
}

export async function violationHistory(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof violationsHistorySchema>,
) {
	authorize(identity);
	return db.transaction(
		async (tx) => {
			const live = await getLiveOperationalIdentity(tx, identity.userId);
			authorize(live);
			if (!live) fail("VIOLATIONS_ACCESS_DENIED", "FORBIDDEN");
			const [report] = await tx
				.select({
					id: violationsReports.id,
					reporterUserId: violationsReports.reporterUserId,
					deletedAt: violationsReports.deletedAt,
				})
				.from(violationsReports)
				.where(eq(violationsReports.id, input.reportId));
			if (!report) fail("VIOLATION_NOT_FOUND", "NOT_FOUND");
			if (
				!canMutateViolation(live, report.reporterUserId) ||
				(report.deletedAt !== null && !hasSuperadminPrivilege(live))
			)
				fail("VIOLATION_HISTORY_ACCESS_DENIED", "FORBIDDEN");
			const entries = await tx
				.select({
					id: violationsAudits.id,
					action: violationsAudits.action,
					reason: violationsAudits.reason,
					beforeState: violationsAudits.beforeState,
					afterState: violationsAudits.afterState,
					actorUserId: violationsAudits.actorUserId,
					createdAt: violationsAudits.createdAt,
				})
				.from(violationsAudits)
				.where(eq(violationsAudits.reportId, report.id))
				.orderBy(desc(violationsAudits.createdAt), desc(violationsAudits.id));
			const names = await getUserDisplayNames(
				tx,
				entries.map((entry) => entry.actorUserId),
			);
			return entries.map((entry) => ({
				...entry,
				actorName: names.get(entry.actorUserId) ?? "",
			}));
		},
		{ isolationLevel: "repeatable read" },
	);
}

export async function deleteViolation(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof violationDeleteSchema>,
) {
	authorize(identity, true);
	try {
		return await db.transaction(async (tx) => {
			const [row] = await tx
				.select()
				.from(violationsReports)
				.where(eq(violationsReports.id, input.reportId))
				.for("update");
			const live = await getLiveOperationalIdentity(tx, identity.userId);
			authorize(live, true);
			if (!live) fail("VIOLATIONS_ACCESS_DENIED", "FORBIDDEN");
			if (!row) fail("VIOLATION_NOT_FOUND", "NOT_FOUND");
			if (!canMutateViolation(live, row.reporterUserId))
				fail("VIOLATION_NOT_OWNER", "FORBIDDEN");
			if (row.deletedAt) fail("VIOLATION_ALREADY_DELETED", "BAD_REQUEST");
			const deletedAtResult = await tx.execute<{ now: Date }>(
				sql`SELECT clock_timestamp() AS now`,
			);
			const deletedAt = new Date(deletedAtResult.rows[0]?.now ?? Number.NaN);
			if (!Number.isFinite(deletedAt.getTime()))
				throw Error("Database time unavailable");
			await tx
				.update(violationsReports)
				.set({
					deletedAt,
					deletedByUserId: live.userId,
					deleteReason: input.reason,
					updatedAt: deletedAt,
					version: row.version + 1,
				})
				.where(eq(violationsReports.id, row.id));
			await tx.insert(violationsAudits).values({
				reportId: row.id,
				actorUserId: live.userId,
				action: "DELETED",
				reason: input.reason,
				beforeState: {
					studentName: row.studentName,
					studentNim: row.studentNim,
					incidentDate: row.incidentDate,
					description: row.description,
					recordedBuildingId: row.recordedBuildingId,
					recordedBuildingName: row.recordedBuildingName,
				},
				afterState: {
					deletedAt: deletedAt.toISOString(),
					deleteReason: input.reason,
				},
			});
			const names = await getUserDisplayNames(tx, [live.userId]);
			return {
				id: row.id,
				publicCode: row.publicCode,
				deletedAt,
				deletedByName: names.get(live.userId) ?? "",
				reason: input.reason,
			};
		});
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "VIOLATION_DELETE_FAILED",
		});
	}
}

export async function updateViolation(
	db: Database,
	storage: ObjectStorage | undefined,
	identity: ActiveIdentity,
	input: z.infer<typeof updateViolationSchema>,
) {
	authorize(identity, true);
	let copiedKey: string | undefined;
	let temporaryObjectKey: string | undefined;
	try {
		let nextKtm:
			| { objectKey: string; contentType: string; sizeBytes: number }
			| undefined;
		if (input.uploadIntentId) {
			if (!storage)
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "VIOLATIONS_STORAGE_UNAVAILABLE",
				});
			const preflight = await db.transaction(async (tx) => {
				const [row] = await tx
					.select()
					.from(violationsReports)
					.where(eq(violationsReports.id, input.reportId));
				const live = await getLiveOperationalIdentity(tx, identity.userId);
				authorize(live, true);
				if (!live) fail("VIOLATIONS_ACCESS_DENIED", "FORBIDDEN");
				if (!row) fail("VIOLATION_NOT_FOUND", "NOT_FOUND");
				if (!canMutateViolation(live, row.reporterUserId))
					fail("VIOLATION_NOT_OWNER", "FORBIDDEN");
				if (row.deletedAt) fail("VIOLATION_ALREADY_DELETED", "BAD_REQUEST");
				if (row.version !== input.expectedVersion)
					fail("VIOLATION_VERSION_CONFLICT", "BAD_REQUEST");
				const [intent] = await tx
					.select()
					.from(violationsUploadIntents)
					.where(
						and(
							eq(violationsUploadIntents.id, input.uploadIntentId as string),
							eq(violationsUploadIntents.reporterUserId, live.userId),
						),
					);
				const time = await tx.execute<{ now: Date }>(
					sql`SELECT clock_timestamp() AS now`,
				);
				const now = new Date(time.rows[0]?.now ?? Number.NaN);
				if (!Number.isFinite(now.getTime()))
					throw Error("Database time unavailable");
				if (!intent || intent.consumedAt || intent.expiresAt <= now)
					fail("VIOLATION_UPLOAD_INTENT_INVALID", "BAD_REQUEST");
				return intent;
			});
			temporaryObjectKey = preflight.temporaryObjectKey;
			const objectKey = `violations/ktm/${randomUUID()}`;
			copiedKey = objectKey;
			const stored = await copyValidatedKtm(
				storage,
				preflight.temporaryObjectKey,
				objectKey,
				preflight.contentType,
			);
			nextKtm = { objectKey, ...stored };
		}
		const result = await db.transaction(async (tx) => {
			const [row] = await tx
				.select()
				.from(violationsReports)
				.where(eq(violationsReports.id, input.reportId))
				.for("update");
			const live = await getLiveOperationalIdentity(tx, identity.userId);
			authorize(live, true);
			if (!live) fail("VIOLATIONS_ACCESS_DENIED", "FORBIDDEN");
			if (!row) fail("VIOLATION_NOT_FOUND", "NOT_FOUND");
			if (!canMutateViolation(live, row.reporterUserId))
				fail("VIOLATION_NOT_OWNER", "FORBIDDEN");
			if (row.deletedAt) fail("VIOLATION_ALREADY_DELETED", "BAD_REQUEST");
			if (row.version !== input.expectedVersion)
				fail("VIOLATION_VERSION_CONFLICT", "BAD_REQUEST");

			if (input.uploadIntentId) {
				const [intent] = await tx
					.select()
					.from(violationsUploadIntents)
					.where(
						and(
							eq(violationsUploadIntents.id, input.uploadIntentId),
							eq(violationsUploadIntents.reporterUserId, live.userId),
						),
					)
					.for("update");
				const nowResult = await tx.execute<{ now: Date }>(
					sql`SELECT clock_timestamp() AS now`,
				);
				const now = new Date(nowResult.rows[0]?.now ?? Number.NaN);
				if (!Number.isFinite(now.getTime()))
					throw Error("Database time unavailable");
				if (!intent || intent.consumedAt || intent.expiresAt <= now)
					fail("VIOLATION_UPLOAD_INTENT_INVALID", "BAD_REQUEST");
				if (!nextKtm) throw Error("Prepared KTM object is missing");
				await tx
					.update(violationsUploadIntents)
					.set({ consumedAt: now, resultObjectKey: nextKtm.objectKey })
					.where(eq(violationsUploadIntents.id, intent.id));
			}

			const timeResult = await tx.execute<{ now: Date }>(
				sql`SELECT clock_timestamp() AS now`,
			);
			const updatedAt = new Date(timeResult.rows[0]?.now ?? Number.NaN);
			if (!Number.isFinite(updatedAt.getTime()))
				throw Error("Database time unavailable");
			const next = {
				studentName: input.studentName ?? row.studentName,
				studentNim: input.studentNim ?? row.studentNim,
				incidentDate: input.incidentDate ?? row.incidentDate,
				description: input.description ?? row.description,
				ktmObjectKey: nextKtm?.objectKey ?? row.ktmObjectKey,
				ktmContentType: nextKtm?.contentType ?? row.ktmContentType,
				ktmSizeBytes: nextKtm?.sizeBytes ?? row.ktmSizeBytes,
			};
			await tx
				.update(violationsReports)
				.set({ ...next, version: row.version + 1, updatedAt })
				.where(eq(violationsReports.id, row.id));
			await tx.insert(violationsAudits).values({
				reportId: row.id,
				actorUserId: live.userId,
				action: "UPDATED",
				reason: input.reason,
				beforeState: {
					studentName: row.studentName,
					studentNim: row.studentNim,
					incidentDate: row.incidentDate,
					description: row.description,
					ktmChanged: nextKtm !== undefined,
				},
				afterState: {
					studentName: next.studentName,
					studentNim: next.studentNim,
					incidentDate: next.incidentDate,
					description: next.description,
					ktmChanged: nextKtm !== undefined,
					version: row.version + 1,
				},
			});
			return { reportId: row.id, version: row.version + 1, updatedAt };
		});
		copiedKey = undefined;
		if (temporaryObjectKey && storage)
			await storage
				.deletePrivateObject(temporaryObjectKey)
				.catch(() => undefined);
		return result;
	} catch (error) {
		if (copiedKey && storage)
			await storage.deletePrivateObject(copiedKey).catch(() => undefined);
		if (error instanceof TRPCError) throw error;
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "VIOLATION_UPDATE_FAILED",
		});
	}
}

export async function violationsStatistics(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof violationsStatisticsSchema>,
) {
	authorize(identity);
	return db.transaction(
		async (tx) => {
			const live = await getLiveOperationalIdentity(tx, identity.userId);
			authorize(live);
			if (!live) fail("VIOLATIONS_ACCESS_DENIED", "FORBIDDEN");
			const filter = and(
				sql`${violationsReports.deletedAt} IS NULL`,
				gte(violationsReports.incidentDate, input.dateFrom),
				lte(violationsReports.incidentDate, input.dateTo),
				input.buildingId
					? eq(violationsReports.recordedBuildingId, input.buildingId)
					: undefined,
			);
			const [total] = await tx
				.select({ total: count() })
				.from(violationsReports)
				.where(filter);
			const byBuilding = await tx
				.select({
					buildingId: violationsReports.recordedBuildingId,
					buildingName: violationsReports.recordedBuildingName,
					count: count(),
				})
				.from(violationsReports)
				.where(filter)
				.groupBy(
					violationsReports.recordedBuildingId,
					violationsReports.recordedBuildingName,
				)
				.orderBy(desc(count()), violationsReports.recordedBuildingName);
			const trend = await tx
				.select({
					date: violationsReports.incidentDate,
					buildingId: violationsReports.recordedBuildingId,
					buildingName: violationsReports.recordedBuildingName,
					count: count(),
				})
				.from(violationsReports)
				.where(filter)
				.groupBy(
					violationsReports.incidentDate,
					violationsReports.recordedBuildingId,
					violationsReports.recordedBuildingName,
				)
				.orderBy(
					violationsReports.incidentDate,
					violationsReports.recordedBuildingName,
				);
			return {
				totalActive: total?.total ?? 0,
				byBuilding,
				trend,
				appliedFilters: {
					dateFrom: input.dateFrom,
					dateTo: input.dateTo,
					buildingId: input.buildingId ?? null,
					dateField: "incidentDate" as const,
					bucket: "day" as const,
					dateSemantics: "calendar-date-inclusive" as const,
				},
			};
		},
		{ isolationLevel: "repeatable read" },
	);
}
