import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ActiveIdentity, ActiveSrIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { eventAuditLogs, events } from "@resora/db/schema/attendance";
import {
	administrativeHistorySchema,
	eventAuditHistorySchema,
} from "./attendance.schema";
import {
	administrativeChanges,
	deletedDraftHistory,
	eventAuditHistory,
} from "./event-audit";

const admin: ActiveIdentity = {
	userId: "synthetic-admin",
	actor: "SYSTEM_ADMIN",
	username: "synthetic.admin",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: true,
};
const state = {
	title: "Before",
	description: "",
	startsAt: "2026-10-18T00:00:00Z",
	endsAt: "2026-10-18T01:00:00Z",
};
function fixture() {
	const calls: string[] = [];
	const row = {
		id: randomUUID(),
		action: "PUBLISHED_CONFIGURATION_EDITED",
		operator: "Synthetic admin",
		reason: "Approved correction",
		createdAt: new Date(),
		before: state,
		after: { ...state, title: "After" },
	};
	const db = {
		select: (fields: Record<string, unknown>) => {
			let table: unknown;
			const q = Object.assign(
				Promise.resolve().then(() => {
					if (table === events) return Promise.resolve([{ id: "event" }]);
					if (table === eventAuditLogs) return Promise.resolve([row, row]);
					expect(Object.keys(fields)).not.toContain("actorUserId");
					return Promise.resolve([
						{
							id: randomUUID(),
							eventId: randomUUID(),
							operator: "Synthetic admin",
							reason: "Unused",
							createdAt: new Date(),
							snapshot: {
								...state,
								status: "DRAFT",
								password: "should-never-leave-storage",
							},
						},
					]);
				}),
				{
					from(t: unknown) {
						table = t;
						return q;
					},
					innerJoin() {
						return q;
					},
					where() {
						return q;
					},
					orderBy(...order: unknown[]) {
						expect(order).toHaveLength(2);
						calls.push("ordered");
						return q;
					},
					limit(n: number) {
						expect(n).toBe(2);
						calls.push("bounded");
						return q;
					},
					offset(n: number) {
						expect(n).toBe(0);
						return q;
					},
				},
			);
			return q;
		},
	} as unknown as Database;
	return { db, calls };
}

test("administrative audit inputs are strict and bounded", () => {
	expect(administrativeHistorySchema.parse({})).toEqual({
		limit: 20,
		offset: 0,
	});
	for (const input of [{ limit: 51 }, { offset: -1 }, { userId: "forged" }])
		expect(administrativeHistorySchema.safeParse(input).success).toBe(false);
	expect(
		eventAuditHistorySchema.safeParse({ eventId: "invalid" }).success,
	).toBe(false);
});

test("both audit readers reject nonadmin, inactive, password-gated and revoked identities before data access", async () => {
	const sr: ActiveSrIdentity = {
		userId: "synthetic-sr",
		actor: "SR",
		nim: "0001",
		departmentCode: "HCO",
		positionCode: "KADEP",
		buildingId: randomUUID(),
		isActive: true,
		mustChangePassword: false,
		isSuperadmin: false,
	};
	const denied: ActiveIdentity[] = [
		sr,
		{ ...admin, isActive: false },
		{ ...admin, mustChangePassword: true },
		{ ...sr, isSuperadmin: false },
	];
	for (const identity of denied) {
		await expect(
			eventAuditHistory({} as Database, identity, { eventId: randomUUID() }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			deletedDraftHistory({} as Database, identity, {}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	}
});

test("event audit projects safe meaningful changes with deterministic bounded pagination", async () => {
	const f = fixture();
	const result = await eventAuditHistory(f.db, admin, {
		eventId: randomUUID(),
		limit: 1,
	});
	expect(result.hasMore).toBe(true);
	expect(result.items).toHaveLength(1);
	expect(result.items[0]?.changes).toEqual([
		{ field: "title", before: "Before", after: "After" },
	]);
	expect(result.items[0]).not.toHaveProperty("before");
	expect(result.items[0]).not.toHaveProperty("after");
	expect(f.calls).toEqual(["ordered", "bounded"]);
});

test("deleted draft reader exposes snapshot fields explicitly, never arbitrary JSON", async () => {
	const result = await deletedDraftHistory(fixture().db, admin, { limit: 1 });
	expect(result.items[0]?.title).toBe("Before");
	expect(result.items[0]).not.toHaveProperty("snapshot");
	expect(JSON.stringify(result)).not.toContain("should-never");
});

test("participant changes expose counts only and location changes omit coordinates", () => {
	const result = administrativeChanges(
		{
			...state,
			participants: { count: 2 },
			session: {
				centerLat: 1,
				centerLng: 2,
				geofenceRadiusM: 20,
				lateGraceMinutes: 15,
				qrTtlMinutes: 60,
			},
		},
		{
			...state,
			participants: {
				count: 3,
				addedUserIds: ["private-added", "private-new"],
				removedUserIds: ["private-removed"],
			},
			session: {
				centerLat: 3,
				centerLng: 4,
				geofenceRadiusM: 40,
				lateGraceMinutes: 15,
				qrTtlMinutes: 60,
			},
		},
	);
	expect(result.participants).toEqual({
		beforeCount: 2,
		afterCount: 3,
		addedCount: 2,
		removedCount: 1,
	});
	expect(result.changes.map((row) => row.field)).toEqual([
		"geofenceRadiusM",
		"location",
	]);
	expect(JSON.stringify(result)).not.toContain("private-");
	expect(JSON.stringify(result)).not.toContain("centerLat");
	expect(
		administrativeChanges({ visibility: "HIDDEN" }, { visibility: "ARCHIVED" })
			.changes,
	).toEqual([{ field: "visibility", before: "HIDDEN", after: "ARCHIVED" }]);
});

test("roster differences explain groups without exposing individual identities", () => {
	const criteria = {
		allSr: false,
		inti: false,
		kadep: false,
		departments: [],
		individuals: ["private-previous"],
		include: [],
		exclude: [],
	};
	const result = administrativeChanges(
		{ ...state, rosterCriteria: criteria },
		{
			...state,
			rosterCriteria: {
				...criteria,
				inti: true,
				kadep: true,
				individuals: ["private-next"],
			},
		},
	);
	expect(result.changes[0]?.field).toBe("roster");
	expect(result.changes[0]?.after).toContain("INTI; KADEP lintas departemen");
	expect(JSON.stringify(result)).not.toContain("private-");
});
