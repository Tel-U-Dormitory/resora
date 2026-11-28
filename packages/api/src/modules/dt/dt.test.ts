import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type {
	ActiveDtIdentity,
	ActiveIdentity,
	ActiveSrIdentity,
} from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	activateDtMembershipSchema,
	computeEffectiveDtStatus,
	endDtMembershipSchema,
	extendDtPeriodSchema,
	registerDtCandidateSchema,
	rejectDtCandidateSchema,
	updateDtAssignmentSchema,
} from "./dt.contracts";
import { listDtMembers, registerDtCandidate } from "./dt.service";
import { authorizeDtManager, authorizeDtPersonal } from "./dt-policy";
import { isDtScopedCriteria } from "../events/events.public";

function srIdentity(
	departmentCode: string,
	positionCode: string,
	overrides: Partial<ActiveSrIdentity> = {},
): ActiveSrIdentity {
	return {
		userId: "synthetic-sr",
		nim: "000012345",
		actor: "SR",
		isActive: true,
		departmentCode,
		positionCode,
		buildingId: randomUUID(),
		mustChangePassword: false,
		isSuperadmin: false,
		...overrides,
	};
}

function dtIdentity(
	overrides: Partial<ActiveDtIdentity> = {},
): ActiveDtIdentity {
	return {
		userId: "synthetic-dt",
		nim: "1301229999",
		actor: "DT",
		isActive: true,
		mustChangePassword: false,
		isSuperadmin: false,
		membershipId: randomUUID(),
		periodName: "2026/2027",
		startsOn: "2026-01-01",
		endsOn: "2026-12-31",
		departmentCode: "ADAPTIF",
		buildingId: null,
		buildingCode: null,
		buildingName: null,
		workProgram: null,
		...overrides,
	};
}

test("DT manager policy allows ADAPTIF SR and legitimate SUPERADMIN, denies other SR and DT", () => {
	for (const pos of ["KADEP", "SEKDEP", "ANGGOTA"]) {
		expect(authorizeDtManager(srIdentity("ADAPTIF", pos))).toBe(true);
		expect(authorizeDtManager(srIdentity("HCO", pos))).toBe(false);
		expect(authorizeDtManager(srIdentity("RND", pos))).toBe(false);
	}
	expect(authorizeDtManager(srIdentity("INTI", "KETUM"))).toBe(false);
	expect(
		authorizeDtManager(srIdentity("RND", "ANGGOTA", { isSuperadmin: true })),
	).toBe(true);
	expect(
		authorizeDtManager({
			userId: "sysadmin",
			actor: "SYSTEM_ADMIN",
			username: "resora.admin",
			isActive: true,
			mustChangePassword: false,
			isSuperadmin: true,
		}),
	).toBe(true);
	expect(
		authorizeDtManager(
			srIdentity("ADAPTIF", "KADEP", {
				isActive: false,
			}),
		),
	).toBe(false);
	expect(
		authorizeDtManager(
			srIdentity("ADAPTIF", "KADEP", {
				passwordResetRequired: true,
			}),
		),
	).toBe(false);
	expect(authorizeDtManager(dtIdentity())).toBe(false);
	expect(authorizeDtManager(null)).toBe(false);
});

test("DT personal policy allows active DT without password rotation gate", () => {
	expect(authorizeDtPersonal(dtIdentity())).toBe(true);
	expect(authorizeDtPersonal(dtIdentity({ isActive: false }))).toBe(false);
	expect(authorizeDtPersonal(dtIdentity({ passwordResetRequired: true }))).toBe(
		false,
	);
	expect(authorizeDtPersonal(srIdentity("ADAPTIF", "KADEP"))).toBe(false);
});

test("DT contracts enforce valid dates, building requirement, nonblank reasons, and reject forged fields", () => {
	const buildingId = randomUUID();
	expect(
		registerDtCandidateSchema.parse({
			name: "  Calon DT  ",
			nim: " 1301230001 ",
			email: "DT.USER@EXAMPLE.COM",
			periodName: " 2026/2027 ",
			buildingId,
		}),
	).toMatchObject({
		name: "Calon DT",
		nim: "1301230001",
		email: "dt.user@example.com",
		periodName: "2026/2027",
		buildingId,
	});

	expect(
		registerDtCandidateSchema.safeParse({
			name: "Calon DT",
			nim: "1301230001",
			email: "dt@example.com",
			periodName: "2026/2027",
		}).success,
	).toBe(false);

	expect(
		registerDtCandidateSchema.safeParse({
			name: "Calon DT",
			nim: "1301 230001",
			email: "dt@example.com",
			periodName: "2026/2027",
			buildingId,
		}).success,
	).toBe(false);

	expect(
		activateDtMembershipSchema.safeParse({
			membershipId: randomUUID(),
			startsOn: "2026-06-01",
			endsOn: "2026-05-31",
		}).success,
	).toBe(false);

	expect(
		activateDtMembershipSchema.safeParse({
			membershipId: randomUUID(),
			startsOn: "2026-06-01",
			endsOn: "2026-12-31",
		}).success,
	).toBe(true);

	for (const schema of [
		rejectDtCandidateSchema,
		endDtMembershipSchema,
		updateDtAssignmentSchema,
		extendDtPeriodSchema,
	]) {
		expect(
			schema.safeParse({
				membershipId: randomUUID(),
				endsOn: "2027-01-01",
				reason: "   ",
			}).success,
		).toBe(false);
	}
});

test("computeEffectiveDtStatus marks expired ACTIVE memberships as EXPIRED", () => {
	expect(
		computeEffectiveDtStatus(
			{ status: "ACTIVE", startsOn: "2026-01-01", endsOn: "2026-11-28" },
			"2026-11-28",
		),
	).toBe("ACTIVE");
	expect(
		computeEffectiveDtStatus(
			{ status: "ACTIVE", startsOn: "2026-01-01", endsOn: "2026-11-27" },
			"2026-11-28",
		),
	).toBe("EXPIRED");
	expect(
		computeEffectiveDtStatus(
			{ status: "ENDED", startsOn: "2026-01-01", endsOn: "2026-12-31" },
			"2026-11-28",
		),
	).toBe("ENDED");
});

test("unauthorized actors fail closed before touching database", async () => {
	const db = {
		select: () => {
			throw new Error("unexpected read");
		},
		transaction: () => {
			throw new Error("unexpected write");
		},
	} as unknown as Database;

	for (const actor of [
		srIdentity("HCO", "KADEP"),
		srIdentity("RND", "ANGGOTA"),
		dtIdentity(),
	] as ActiveIdentity[]) {
		await expect(
			listDtMembers(db, actor, {
				search: "",
				periodName: "",
				limit: 20,
				offset: 0,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		await expect(
			registerDtCandidate(
				db,
				actor,
				{
					BETTER_AUTH_URL: "http://localhost:3000",
					BETTER_AUTH_SECRET: "synthetic-secret-0000000000000000",
					CORS_ORIGIN: "http://localhost:3001",
				},
				{
					name: "Test",
					nim: "1301230001",
					email: "test@example.com",
					periodName: "2026/2027",
					buildingId: randomUUID(),
					registrationNotes: "",
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	}
});

test("isDtScopedCriteria allows DT-only rosters and rejects SR or committee scopes", () => {
	const dtA = randomUUID();
	const srA = randomUUID();
	const dtIds = new Set([dtA]);
	expect(
		isDtScopedCriteria(
			{
				allSr: false,
				allDt: true,
				departments: [],
				inti: false,
				kadep: false,
				individuals: [],
				include: [],
			},
			"SR",
			dtIds,
		),
	).toBe(true);
	expect(
		isDtScopedCriteria(
			{
				allSr: false,
				allDt: false,
				departments: [],
				inti: false,
				kadep: false,
				individuals: [dtA],
				include: [],
			},
			"SR",
			dtIds,
		),
	).toBe(true);
	expect(
		isDtScopedCriteria(
			{
				allSr: true,
				allDt: true,
				departments: [],
				inti: false,
				kadep: false,
				individuals: [],
				include: [],
			},
			"SR",
			dtIds,
		),
	).toBe(false);
	expect(
		isDtScopedCriteria(
			{
				allSr: false,
				allDt: true,
				departments: [],
				inti: false,
				kadep: false,
				individuals: [],
				include: [srA],
			},
			"SR",
			dtIds,
		),
	).toBe(false);
	expect(
		isDtScopedCriteria(
			{
				allSr: false,
				allDt: true,
				departments: [],
				inti: false,
				kadep: false,
				individuals: [],
				include: [],
			},
			"COMMITTEE",
			dtIds,
		),
	).toBe(false);
});
