import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { type AuthConfig, createAuth } from "@resora/auth";
import {
	getActiveIdentity,
	getDtAccessStatus,
} from "@resora/auth/sr-access";
import { createDb } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import { session } from "@resora/db/schema/auth";
import { dtAudits } from "@resora/db/schema/dt";
import {
	buildings,
	srPeriodMemberships,
	srPeriods,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { eq, ne } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
	adminArchiveDtAccount,
	adminResetDtAccountPassword,
	adminUpdateDtAccount,
	getDtMemberDetail,
	getDtParticipationRecap,
	getMyDtPortal,
	listAdminDtAccounts,
} from "../../../../application/dt";
import {
	createEvent,
	listEvents,
	publishEvent,
} from "../../../../application/internal-events";
import { manualInsert, ownHistory, recap as recapAttendance } from "../../../attendance/attendance.public";
import {
	addMembers,
	committeeCandidates,
	committeeDetail,
	createCommittee,
	saveDivision,
} from "../../../committee/committee.service";
import { createSrAccount } from "../../../identity/provisioning/sr-account";
import {
	activateDtMembership,
	archiveDtMembership,
	endDtMembership,
	extendDtPeriod,
	listDtMembers,
	registerDtCandidate,
	rejectDtCandidate,
	resetDtPassword,
	updateDtAssignment,
} from "../../dt.service";

const TEST_DB_URL = process.env.DT_TEST_DATABASE_URL;
const authConfig: AuthConfig = {
	BETTER_AUTH_URL: "http://127.0.0.1:3000",
	CORS_ORIGIN: "http://127.0.0.1:3001",
	BETTER_AUTH_SECRET: "synthetic-dt-integration-secret-000000000000",
	NODE_ENV: "test",
	AUTH_RATE_LIMIT_ENABLED: "false",
};

if (!TEST_DB_URL) {
	test.skip("DT integration tests require DT_TEST_DATABASE_URL", () => {});
} else {
	const db = createDb({ DATABASE_URL: TEST_DB_URL });

	let buildingId = "";
	let buildingId2 = "";
	let adaptifSr!: NonNullable<Awaited<ReturnType<typeof getActiveIdentity>>>;
	let hcoSr!: NonNullable<Awaited<ReturnType<typeof getActiveIdentity>>>;
	let rndSr!: NonNullable<Awaited<ReturnType<typeof getActiveIdentity>>>;
	let superadminSr!: NonNullable<Awaited<ReturnType<typeof getActiveIdentity>>>;

	async function provisionActiveSr(input: {
		name: string;
		nim: string;
		email: string;
		departmentCode: string;
		positionCode: string;
		periodId: string;
		grantSuperadmin?: boolean;
	}) {
		const userId = await db.transaction(async (tx) => {
			const ctx = await createAuth(authConfig, tx).$context;
			const hash = await ctx.password.hash("SyntheticPass123!");
			const id = await createSrAccount(
				tx,
				ctx,
				{
					name: input.name,
					nim: input.nim,
					email: input.email,
					departmentCode: input.departmentCode,
					positionCode: input.positionCode,
					buildingId,
					isActive: true,
				},
				hash,
			);
			await tx
				.insert(srPeriodMemberships)
				.values({ userId: id, periodId: input.periodId });
			if (input.grantSuperadmin) {
				await tx
					.update(userProfiles)
					.set({ mustChangePassword: false })
					.where(eq(userProfiles.userId, id));
				await tx.insert(systemPrivileges).values({
					userId: id,
					privilegeCode: "SUPERADMIN",
					grantedByUserId: id,
				});
			}
			return id;
		});
		const identity = await getActiveIdentity(db, userId);
		if (!identity) throw new Error(`Failed to provision SR ${input.nim}`);
		return identity;
	}

	beforeAll(async () => {
		const migrationsFolder = resolve(
			import.meta.dir,
			"../../../../../../db/src/migrations",
		);
		await migrate(db, { migrationsFolder });
		await seedOrganization(db);
		const [bldg] = await db
			.select({ id: buildings.id })
			.from(buildings)
			.where(eq(buildings.code, "A"));
		if (!bldg) throw new Error("Missing building A");
		buildingId = bldg.id;
		const [bldg2] = await db
			.select({ id: buildings.id })
			.from(buildings)
			.where(ne(buildings.id, bldg.id));
		buildingId2 = bldg2?.id ?? bldg.id;

		const [period] = await db
			.insert(srPeriods)
			.values({
				name: `DT Test Period ${randomUUID().slice(0, 6)}`,
				startsOn: "2026-01-01",
				endsOn: "2026-12-31",
			})
			.returning();
		if (!period) throw new Error("Missing period");

		adaptifSr = await provisionActiveSr({
			name: "Adaptif Operator",
			nim: `9901${randomUUID().slice(0, 6)}`,
			email: `adaptif-${randomUUID().slice(0, 6)}@example.invalid`,
			departmentCode: "ADAPTIF",
			positionCode: "ANGGOTA",
			periodId: period.id,
		});
		hcoSr = await provisionActiveSr({
			name: "HCO Kadep",
			nim: `9902${randomUUID().slice(0, 6)}`,
			email: `hco-${randomUUID().slice(0, 6)}@example.invalid`,
			departmentCode: "HCO",
			positionCode: "KADEP",
			periodId: period.id,
		});
		rndSr = await provisionActiveSr({
			name: "RnD Anggota",
			nim: `9903${randomUUID().slice(0, 6)}`,
			email: `rnd-${randomUUID().slice(0, 6)}@example.invalid`,
			departmentCode: "RND",
			positionCode: "ANGGOTA",
			periodId: period.id,
		});
		superadminSr = await provisionActiveSr({
			name: "Superadmin Operator",
			nim: `9904${randomUUID().slice(0, 6)}`,
			email: `sa-${randomUUID().slice(0, 6)}@example.invalid`,
			departmentCode: "INTI",
			positionCode: "KETUM",
			periodId: period.id,
			grantSuperadmin: true,
		});
	});

	afterAll(async () => {
		await db.$client.end();
	});

	test("full DT lifecycle, RBAC isolation, committee & event participation, revocation, and append-only audit", async () => {
		const candidateNim = `1301${Math.floor(100000 + Math.random() * 899999)}`;
		const candidateEmail = `dt-${candidateNim}@example.invalid`;

		// AC03: Non-Adaptif SR is denied
		await expect(
			registerDtCandidate(db, rndSr, authConfig, {
				name: "Denied",
				nim: candidateNim,
				email: candidateEmail,
				periodName: "2026/2027",
				buildingId,
				registrationNotes: "",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		// AC01: ADAPTIF registers candidate; candidate cannot get active identity
		const registered = await registerDtCandidate(db, adaptifSr, authConfig, {
			name: "Budi Dorm Team",
			nim: candidateNim,
			email: candidateEmail,
			periodName: "2026/2027",
			buildingId,
			workProgram: "Pendampingan Maba",
			registrationNotes: "Lolos seleksi berkas",
		});
		expect(await getActiveIdentity(db, registered.userId)).toBeNull();
		expect(await getDtAccessStatus(db, registered.userId)).toBe("CANDIDATE");

		// AC02: ADAPTIF activates candidate -> DT gets active identity
		const activated = await activateDtMembership(db, adaptifSr, authConfig, {
			membershipId: registered.membershipId,
			startsOn: "2026-01-01",
			endsOn: "2026-12-31",
			buildingId,
			workProgram: "Pendampingan Maba",
			reason: "Lulus wawancara",
		});
		expect(activated.temporaryPassword.length).toBeGreaterThan(10);

		const dtIdentity = await getActiveIdentity(db, registered.userId);
		expect(dtIdentity?.actor).toBe("DT");
		if (!dtIdentity || dtIdentity.actor !== "DT") {
			throw new Error("Expected active DT identity");
		}
		expect(dtIdentity.periodName).toBe("2026/2027");

		// AC04: Update building assignment with mandatory reason writes history & audit
		await updateDtAssignment(db, adaptifSr, {
			membershipId: registered.membershipId,
			buildingId: buildingId2,
			workProgram: "Pendampingan Gedung",
			reason: "Rotasi gedung triwulan 2",
		});

		// AC05: Extend period
		const extended = await extendDtPeriod(db, adaptifSr, {
			membershipId: registered.membershipId,
			endsOn: "2027-03-31",
			reason: "Perpanjangan masa tugas",
		});
		expect(extended.endsOn).toBe("2027-03-31");

		// AC08: HCO adds active DT to committee
		const committee = await createCommittee(db, hcoSr, {
			name: `Panitia DT ${randomUUID().slice(0, 6)}`,
			description: "Uji partisipasi DT",
		});
		if (!committee) throw new Error("Committee missing");
		const division = await saveDivision(db, hcoSr, {
			committeeId: committee.id,
			name: "Divisi Operasional",
		});
		if (!division) throw new Error("Division missing");
		const cands = await committeeCandidates(
			db,
			hcoSr,
			committee.id,
			candidateNim,
		);
		expect(
			cands.some(
				(c) => c.userId === registered.userId && c.actorType === "DT",
			),
		).toBe(true);

		await addMembers(db, hcoSr, {
			committeeId: committee.id,
			divisionId: division.id,
			positionCode: "ANGGOTA",
			userIds: [registered.userId],
		});
		const cDetail = await committeeDetail(db, hcoSr, committee.id);
		expect(
			cDetail.members.some(
				(m) => m.userId === registered.userId && m.actorType === "DT",
			),
		).toBe(true);

		// AC09: Committee event includes DT; SR-only event excludes DT
		const now = Date.now();
		const dtEvent = await createEvent(db, hcoSr, {
			title: "Rapat Panitia Dengan DT",
			description: "Kegiatan melibatkan DT",
			startsAt: new Date(now + 60 * 60 * 1000).toISOString(),
			endsAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
			organizationContext: "COMMITTEE",
			committeeId: committee.id,
			rosterCriteria: {
				allSr: false,
				departments: [],
				inti: false,
				kadep: false,
				individuals: [],
				include: [],
				exclude: [],
			},
			session: {
				centerLat: -6.9712891,
				centerLng: 107.628339,
				geofenceRadiusM: 20,
				lateGraceMinutes: 15,
				qrTtlMinutes: 360,
			},
		});
		await publishEvent(db, hcoSr, dtEvent.eventId);

		const srOnlyEvent = await createEvent(db, hcoSr, {
			title: "Rapat Internal SR Saja",
			description: "Khusus SR",
			startsAt: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
			endsAt: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
			organizationContext: "SR",
			rosterCriteria: {
				allSr: true,
				departments: [],
				inti: false,
				kadep: false,
				individuals: [],
				include: [],
				exclude: [],
			},
			session: {
				centerLat: -6.9712891,
				centerLng: 107.628339,
				geofenceRadiusM: 20,
				lateGraceMinutes: 15,
				qrTtlMinutes: 360,
			},
		});
		await publishEvent(db, hcoSr, srOnlyEvent.eventId);

		// ADAPTIF creates & publishes DT-only attendance event and checks its recap,
		// while being rejected from creating or recapping SR-wide events
		const adaptifDtEvent = await createEvent(db, adaptifSr, {
			title: "Briefing Gedung DT oleh Adaptif",
			description: "Absensi khusus DT",
			startsAt: new Date(now + 5 * 60 * 60 * 1000).toISOString(),
			endsAt: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
			organizationContext: "SR",
			rosterCriteria: {
				allSr: false,
				allDt: true,
				departments: [],
				inti: false,
				kadep: false,
				individuals: [],
				include: [],
				exclude: [],
			},
			session: {
				centerLat: -6.9712891,
				centerLng: 107.628339,
				geofenceRadiusM: 20,
				lateGraceMinutes: 15,
				qrTtlMinutes: 360,
			},
		});
		await publishEvent(db, adaptifSr, adaptifDtEvent.eventId);
		const adaptifEvents = await listEvents(db, adaptifSr);
		expect(adaptifEvents.canManageDtEvents).toBe(true);
		const managedDtRow = adaptifEvents.events.find(
			(e) => e.id === adaptifDtEvent.eventId,
		);
		expect(managedDtRow?.isDtScoped).toBe(true);
		const adaptifRecap = await recapAttendance(
			db,
			adaptifSr,
			adaptifDtEvent.eventId,
		);
		expect(
			adaptifRecap.participants.some((r) => r.userId === registered.userId),
		).toBe(true);
		await expect(
			createEvent(db, adaptifSr, {
				title: "Illegal SR Event by Adaptif",
				description: "Must fail",
				startsAt: new Date(now + 7 * 60 * 60 * 1000).toISOString(),
				endsAt: new Date(now + 8 * 60 * 60 * 1000).toISOString(),
				organizationContext: "SR",
				rosterCriteria: {
					allSr: true,
					departments: [],
					inti: false,
					kadep: false,
					individuals: [],
					include: [],
					exclude: [],
				},
				session: {
					centerLat: -6.9712891,
					centerLng: 107.628339,
					geofenceRadiusM: 20,
					lateGraceMinutes: 15,
					qrTtlMinutes: 360,
				},
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			recapAttendance(db, adaptifSr, srOnlyEvent.eventId),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		const dtEventsList = await listEvents(db, dtIdentity);
		expect(dtEventsList.events.some((e) => e.id === dtEvent.eventId)).toBe(
			true,
		);
		expect(dtEventsList.events.some((e) => e.id === srOnlyEvent.eventId)).toBe(
			false,
		);

		// Manual attendance record & ownHistory for DT
		await manualInsert(db, hcoSr, {
			eventId: dtEvent.eventId,
			userId: registered.userId,
			attendanceAt: new Date(now - 5_000).toISOString(),
			reason: "Simulasi kehadiran DT",
		});
		const dtOwnHistory = await ownHistory(db, dtIdentity, {
			limit: 10,
			offset: 0,
		});
		expect(
			dtOwnHistory.items.find((item) => item.event.id === dtEvent.eventId)
				?.presence,
		).toBe("PRESENT");
		expect(
			dtOwnHistory.items.some((item) => item.event.id === adaptifDtEvent.eventId),
		).toBe(true);

		// Portal & Recap
		const portal = await getMyDtPortal(db, dtIdentity);
		expect(portal.attendanceSummary.present).toBe(1);
		expect(portal.committees.length).toBe(1);
		expect(portal.assignmentHistory.length).toBe(2);

		const recap = await getDtParticipationRecap(db, adaptifSr, {
			search: candidateNim,
			periodName: "",
			limit: 20,
			offset: 0,
		});
		expect(recap.items[0]?.attendance.present).toBe(1);
		expect(recap.items[0]?.committeeCount).toBe(1);

		const detail = await getDtMemberDetail(
			db,
			adaptifSr,
			registered.membershipId,
		);
		expect(detail.audits.length).toBeGreaterThanOrEqual(4);

		// SUPERADMIN manages DT accounts (non-superadmin ADAPTIF rejected on admin account API)
		await expect(listAdminDtAccounts(db, adaptifSr)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		const adminAccounts = await listAdminDtAccounts(db, superadminSr);
		const targetAccount = adminAccounts.accounts.find(
			(a) => a.userId === registered.userId,
		);
		expect(targetAccount?.nim).toBe(candidateNim);
		if (!targetAccount) throw new Error("Missing DT admin account row");
		await adminUpdateDtAccount(db, superadminSr, {
			userId: targetAccount.userId,
			name: "Budi Dorm Team Edited",
			email: targetAccount.email,
			buildingId,
			isActive: true,
			expectedUpdatedAt: targetAccount.updatedAt.toISOString(),
		});
		const adminAccountsAfterEdit = await listAdminDtAccounts(db, superadminSr);
		const editedRow = adminAccountsAfterEdit.accounts.find(
			(a) => a.userId === registered.userId,
		);
		expect(editedRow?.name).toBe("Budi Dorm Team Edited");
		expect(editedRow?.buildingId).toBe(buildingId);
		const adminResetRes = await adminResetDtAccountPassword(
			db,
			superadminSr,
			authConfig,
			{ userId: registered.userId },
		);
		expect(adminResetRes.temporaryPassword.length).toBeGreaterThan(10);
		const adminAccountsAfterReset = await listAdminDtAccounts(db, superadminSr);
		const rowAfterReset = adminAccountsAfterReset.accounts.find(
			(a) => a.userId === registered.userId,
		);
		if (!rowAfterReset) throw new Error("Missing row after password reset");
		await adminArchiveDtAccount(db, superadminSr, {
			userId: rowAfterReset.userId,
			expectedUpdatedAt: rowAfterReset.updatedAt.toISOString(),
		});
		expect(await getActiveIdentity(db, registered.userId)).toBeNull();
		const adminAccountsAfterArchive = await listAdminDtAccounts(
			db,
			superadminSr,
		);
		const archivedRow = adminAccountsAfterArchive.accounts.find(
			(a) => a.userId === registered.userId,
		);
		expect(archivedRow?.isActive).toBe(false);
		if (!archivedRow) throw new Error("Missing archived row");
		await adminUpdateDtAccount(db, superadminSr, {
			userId: archivedRow.userId,
			name: "Budi Dorm Team Edited",
			email: archivedRow.email,
			isActive: true,
			expectedUpdatedAt: archivedRow.updatedAt.toISOString(),
		});

		// Reset password rotates & revokes sessions
		await db.insert(session).values({
			id: `sess-${randomUUID()}`,
			token: `tok-${randomUUID()}`,
			userId: registered.userId,
			expiresAt: new Date(now + 3600_000),
		});
		const resetRes = await resetDtPassword(
			db,
			adaptifSr,
			authConfig,
			registered.membershipId,
		);
		expect(resetRes.temporaryPassword).not.toBe(activated.temporaryPassword);
		const sessionsAfterReset = await db
			.select({ id: session.id })
			.from(session)
			.where(eq(session.userId, registered.userId));
		expect(sessionsAfterReset.length).toBe(0);

		// AC05/AC06: End & archive revoke DT access while preserving history
		await endDtMembership(db, adaptifSr, {
			membershipId: registered.membershipId,
			reason: "Selesai masa tugas",
		});
		expect(await getActiveIdentity(db, registered.userId)).toBeNull();
		expect(await getDtAccessStatus(db, registered.userId)).toBe("EXPIRED");

		await archiveDtMembership(db, adaptifSr, {
			membershipId: registered.membershipId,
			reason: "Arsip akhir periode",
		});
		const archivedDetail = await getDtMemberDetail(
			db,
			adaptifSr,
			registered.membershipId,
		);
		expect(archivedDetail.membership.effectiveStatus).toBe("ARCHIVED");
		expect(archivedDetail.assignmentHistory.length).toBe(3);

		// AC10: Append-only audit trigger blocks mutation
		await expect(
			db
				.update(dtAudits)
				.set({ reason: "Tamper" })
				.where(eq(dtAudits.membershipId, registered.membershipId))
				.execute(),
		).rejects.toThrow();

		// Reject candidate path
		const rejNim = `1301${Math.floor(100000 + Math.random() * 899999)}`;
		const rejReg = await registerDtCandidate(db, adaptifSr, authConfig, {
			name: "Calon Ditolak",
			nim: rejNim,
			email: `rej-${rejNim}@example.invalid`,
			periodName: "2026/2027",
			buildingId,
			registrationNotes: "",
		});
		await rejectDtCandidate(db, adaptifSr, {
			membershipId: rejReg.membershipId,
			reason: "Kuota penuh",
		});
		const [listRes] = (
			await listDtMembers(db, adaptifSr, {
				search: rejNim,
				periodName: "",
				limit: 20,
				offset: 0,
			})
		).items;
		expect(listRes?.effectiveStatus).toBe("REJECTED");
	});
}
