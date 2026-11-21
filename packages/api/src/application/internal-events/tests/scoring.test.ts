import { expect, test } from "bun:test";
import type { ActiveSrIdentity } from "@resora/auth/sr-access";
import {
	advancedEventEditSchema,
	deleteDraftSchema,
	eventVisibilitySchema,
	manualCorrectSchema,
	manualInsertSchema,
	setScoringModeSchema,
} from "../../../contracts/attendance";
import { administrativeChanges } from "../../../modules/events/event-audit";
import { canManageEventScoring } from "../../../modules/identity/identity.public";
import { appRouter } from "../../../routers";
import { getEvent, setScoringMode } from "..";
import { fixture } from "./fixtures/event-workflow";

function hco(positionCode = "KADEP", departmentCode = "HCO"): ActiveSrIdentity {
	return {
		userId: "synthetic-admin",
		actor: "SR",
		nim: "000001",
		isActive: true,
		mustChangePassword: false,
		isSuperadmin: false,
		departmentCode,
		positionCode,
		buildingId: "synthetic-building",
	};
}
const input = (
	f: ReturnType<typeof fixture>,
	scoringMode: "INCLUDED" | "EXCLUDED" = "INCLUDED",
) => ({
	eventId: f.state.event.id,
	scoringMode,
});

test("scoring accepts INCLUDED/EXCLUDED without a reason and rejects client-supplied audit evidence", () => {
	const f = fixture();
	for (const scoringMode of ["INCLUDED", "EXCLUDED"] as const)
		expect(setScoringModeSchema.safeParse(input(f, scoringMode)).success).toBe(
			true,
		);
	for (const data of [
		{ scoringMode: null },
		{ scoringMode: "ALL" },
		{ reason: "  " },
		{ reason: "a".repeat(2001) },
		{ eventId: "invalid" },
		{ actorUserId: "spoof" },
	])
		expect(
			setScoringModeSchema.safeParse({ ...input(f), ...data }).success,
		).toBe(false);
});

test("manual attendance and other administrative workflows still require nonblank reasons", () => {
	const { eventId } = input(fixture());
	for (const [schema, data] of [
		[deleteDraftSchema, { eventId }],
		[eventVisibilitySchema, { eventId, action: "HIDE" }],
		[
			advancedEventEditSchema,
			{ eventId, mode: "LIMITED", title: "Title", description: "Description" },
		],
		[manualInsertSchema, { eventId, userId: "synthetic-sr" }],
		[
			manualCorrectSchema,
			{ attendanceId: eventId, attendanceAt: "2026-10-12T02:00:00Z" },
		],
	] as const) {
		expect(schema.safeParse(data).success).toBe(false);
		expect(schema.safeParse({ ...data, reason: " " }).success).toBe(false);
		expect(
			schema.safeParse({ ...data, reason: "Actual correction" }).success,
		).toBe(true);
	}
});

test("only operational HCO KADEP and legitimate SUPERADMIN have intrinsic scoring authority", () => {
	for (const identity of [
		hco(),
		fixture().state.identity,
		{ ...hco("ANGGOTA", "RND"), isSuperadmin: true },
	])
		expect(canManageEventScoring(identity)).toBe(true);
	for (const identity of [
		null,
		hco("SEKDEP"),
		hco("ANGGOTA"),
		hco("KADEP", "RND"),
		hco("KADEP", "ADAPTIF"),
		hco("PJ"),
		{ ...hco(), isActive: false },
		{ ...hco(), passwordResetRequired: true as const },
		{ ...fixture().state.identity, mustChangePassword: true },
		{ ...fixture().state.identity, passwordResetRequired: true as const },
	])
		expect(canManageEventScoring(identity)).toBe(false);
});

test("NULL classification, all transitions and no-op preserve event, snapshots, session and attendance", async () => {
	for (const actor of [hco(), fixture().state.identity]) {
		const f = fixture();
		f.state.identity = actor;
		const saved = structuredClone({
			event: f.state.event,
			session: f.state.session,
			participants: f.state.participants,
			records: f.state.records,
			qr: f.state.qrReferences,
		});
		expect(
			(await getEvent(f.db, actor, f.state.event.id)).event
				.attendanceScoringMode,
		).toBeNull();
		for (const [before, after] of [
			[null, "INCLUDED"],
			["INCLUDED", "EXCLUDED"],
			["EXCLUDED", "INCLUDED"],
		] as const) {
			expect(await setScoringMode(f.db, actor, input(f, after))).toEqual({
				scoringMode: after,
				changed: true,
			});
			expect(f.state.audits.at(-1)).toMatchObject({
				actorUserId: actor.userId,
				eventId: f.state.event.id,
				action: "ATTENDANCE_SCORING_MODE_CHANGED",
				reason: `Klasifikasi penilaian kehadiran diubah dari ${before ?? "Belum diklasifikasikan"} menjadi ${after}.`,
				beforeState: { attendanceScoringMode: before },
				afterState: { attendanceScoringMode: after },
			});
		}
		const writes = f.state.writes.length;
		expect(await setScoringMode(f.db, actor, input(f))).toEqual({
			scoringMode: "INCLUDED",
			changed: false,
		});
		expect(f.state.audits).toHaveLength(3);
		expect(f.state.writes).toHaveLength(writes);
		expect(f.state.locks.slice(0, 2)).toEqual([
			"events:update",
			"attendance_sessions:update",
		]);
		expect(saved).toEqual({
			event: { ...f.state.event, attendanceScoringMode: null },
			session: f.state.session,
			participants: f.state.participants,
			records: f.state.records,
			qr: f.state.qrReferences,
		});
	}
	const f = fixture();
	await setScoringMode(f.db, f.state.identity, input(f, "EXCLUDED"));
	expect(f.state.audits[0]).toMatchObject({
		beforeState: { attendanceScoringMode: null },
		afterState: { attendanceScoringMode: "EXCLUDED" },
	});
});

test("unauthorized, invalid payload and revoked live identities never write", async () => {
	for (const actor of [
		hco("ANGGOTA"),
		hco("SEKDEP"),
		hco("KADEP", "RND"),
		{ ...hco(), isActive: false },
	]) {
		const f = fixture();
		await expect(setScoringMode(f.db, actor, input(f))).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(f.state.writes).toEqual([]);
	}
	for (const change of [
		"demoted",
		"inactive",
		"expired",
		"unassigned",
		"reset",
		"invalid",
		"privilege-revoked",
	]) {
		const f = fixture();
		f.state.identity =
			change === "privilege-revoked" ? f.state.identity : hco();
		const stale = { ...f.state.identity };
		f.state.onEventLock = () => {
			if (change === "demoted") f.state.identity = hco("ANGGOTA");
			if (change === "inactive") f.state.identity.isActive = false;
			if (change === "expired" || change === "unassigned")
				f.state.tenureStatus = change.toUpperCase();
			if (change === "reset") f.state.identity.passwordResetRequired = true;
			if (change === "invalid") f.state.identity = hco("PJ");
			if (change === "privilege-revoked") f.state.identity.isSuperadmin = false;
		};
		await expect(setScoringMode(f.db, stale, input(f))).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(f.state.writes).toEqual([]);
	}
	const f = fixture();
	const forged = { ...input(f), reason: "Client-authored audit evidence" };
	await expect(
		setScoringMode(f.db, f.state.identity, forged),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	expect(f.state.writes).toEqual([]);
});

test("DRAFT is rejected; CLOSED historical/archived events can be classified; missing event fails closed", async () => {
	const f = fixture();
	f.state.event.status = "DRAFT";
	await expect(
		setScoringMode(f.db, f.state.identity, input(f)),
	).rejects.toMatchObject({ code: "CONFLICT" });
	expect(f.state.writes).toEqual([]);
	f.state.event.status = "CLOSED";
	f.state.event.visibility = "ARCHIVED";
	f.state.session.status = "CLOSED";
	expect((await setScoringMode(f.db, f.state.identity, input(f))).changed).toBe(
		true,
	);
	f.state.eventDeleted = true;
	await expect(
		setScoringMode(f.db, f.state.identity, input(f)),
	).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("audit failure rolls back classification atomically", async () => {
	const f = fixture();
	f.state.auditFailure = true;
	await expect(
		setScoringMode(f.db, f.state.identity, input(f)),
	).rejects.toThrow("synthetic audit failure");
	expect(f.state.event.attendanceScoringMode).toBeNull();
	expect(f.state.audits).toEqual([]);
});

test("detail capability follows scoring policy and audit projection excludes raw JSON", async () => {
	for (const actor of [
		hco(),
		hco("ANGGOTA"),
		hco("SEKDEP"),
		fixture().state.identity,
	]) {
		const f = fixture();
		f.state.identity = actor;
		expect(
			(await getEvent(f.db, actor, f.state.event.id)).canManageScoringMode,
		).toBe(canManageEventScoring(actor));
		f.state.event.status = "DRAFT";
		expect(
			(await getEvent(f.db, actor, f.state.event.id)).canManageScoringMode,
		).toBe(false);
	}
	expect(
		administrativeChanges(
			{ attendanceScoringMode: null },
			{ attendanceScoringMode: "INCLUDED" },
		),
	).toEqual({
		changes: [
			{ field: "attendanceScoringMode", before: null, after: "INCLUDED" },
		],
		participants: null,
	});
});

test("protected scoring mutation rejects absent identity and forged authorization fields", async () => {
	const f = fixture();
	const caller = appRouter.createCaller({
		db: f.db,
		identity: null,
		session: null,
	} as never);
	await expect(
		caller.attendance.setScoringMode(input(f)),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	const authenticated = appRouter.createCaller({
		db: f.db,
		identity: f.state.identity,
		session: { user: { id: f.state.identity.userId } },
	} as never);
	await expect(
		authenticated.attendance.setScoringMode({
			...input(f),
			isSuperadmin: true,
		} as never),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	expect(f.state.writes).toEqual([]);
});
