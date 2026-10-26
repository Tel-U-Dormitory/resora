import { expect, test } from "bun:test";
import type { ActiveIdentity, ActiveSrIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { officialDepartments } from "@resora/db/organization";
import {
	canManageBroadcast,
	canReadBroadcast,
} from "../identity/identity-policy";
import { broadcastRouter } from "./broadcast.router";
import {
	broadcastFieldsSchema,
	broadcastIdSchema,
	listBroadcastsSchema,
	updateBroadcastSchema,
} from "./broadcast.schema";
import {
	createBroadcast,
	isBroadcastActive,
	listBroadcasts,
	resolveBroadcastExpiry,
} from "./broadcast.service";

const identity: ActiveSrIdentity = {
	userId: "synthetic-broadcast",
	actor: "SR",
	nim: "00001",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: false,
	departmentCode: "HCO",
	positionCode: "KADEP",
	buildingId: "synthetic-building",
};
const admin: ActiveIdentity = {
	userId: "synthetic-admin",
	actor: "SYSTEM_ADMIN",
	username: "synthetic.admin",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: true,
};

test("broadcast authority uses only valid structural assignments and explicit SUPERADMIN", () => {
	for (const positionCode of ["KETUM", "WAKETUM", "SEKRETARIS", "BENDAHARA"]) {
		expect(
			canManageBroadcast({ ...identity, departmentCode: "INTI", positionCode }),
		).toBe(true);
	}
	for (const { code } of officialDepartments.filter(
		(row) => row.code !== "INTI",
	)) {
		expect(canManageBroadcast({ ...identity, departmentCode: code })).toBe(
			true,
		);
		for (const positionCode of ["SEKDEP", "ANGGOTA"]) {
			const current = {
				...identity,
				departmentCode: code,
				positionCode,
				committeePositionCode: "KADEP",
			};
			expect(canReadBroadcast(current)).toBe(true);
			expect(canManageBroadcast(current)).toBe(false);
		}
	}
	for (const current of [
		admin,
		{
			...identity,
			departmentCode: "RND",
			positionCode: "ANGGOTA",
			isSuperadmin: true,
		},
	]) {
		expect(canReadBroadcast(current)).toBe(true);
		expect(canManageBroadcast(current)).toBe(true);
	}
	for (const current of [
		null,
		undefined,
		{ ...identity, isActive: false },
		{ ...identity, positionCode: "PJ" },
		{ ...identity, departmentCode: "INTI", positionCode: "KADEP" },
		{ ...identity, passwordResetRequired: true },
		{ ...identity, isSuperadmin: true, mustChangePassword: true },
		{ ...admin, mustChangePassword: true },
		{ ...admin, passwordResetRequired: true },
		{ ...admin, isSuperadmin: false },
	]) {
		expect(canReadBroadcast(current as ActiveIdentity | null)).toBe(false);
		expect(canManageBroadcast(current as ActiveIdentity | null)).toBe(false);
	}
	// Stored initial-password flag is not mandatory rotation for ordinary SR.
	expect(canReadBroadcast({ ...identity, mustChangePassword: true })).toBe(
		true,
	);
});

test("strict broadcast inputs trim text and reject unsafe URLs, HTML, forged ownership and dates", () => {
	const valid = { title: " Photoshoot ", content: " First line\nSecond line " };
	expect(broadcastFieldsSchema.parse(valid)).toEqual({
		title: "Photoshoot",
		content: "First line\nSecond line",
	});
	for (const linkUrl of [
		"https://example.invalid/info?a=b",
		"http://example.invalid",
		null,
	])
		expect(broadcastFieldsSchema.safeParse({ ...valid, linkUrl }).success).toBe(
			true,
		);
	for (const patch of [
		{ title: " " },
		{ title: "x".repeat(151) },
		{ content: " " },
		{ content: "x".repeat(5001) },
		{ content: "<script>alert(1)</script>" },
		{ title: "<b>Title</b>" },
		{ linkUrl: "javascript:alert(1)" },
		{ linkUrl: "data:text/html,hi" },
		{ linkUrl: "ftp://example.invalid" },
		{ linkUrl: `https://example.invalid/${"x".repeat(2048)}` },
		{ linkUrl: "/relative" },
		{ expiresAt: "invalid" },
		{ createdByUserId: "forged" },
		{ publishedAt: "2026-01-01T00:00:00Z" },
	])
		expect(
			broadcastFieldsSchema.safeParse({ ...valid, ...patch }).success,
		).toBe(false);
	expect(listBroadcastsSchema.parse({})).toEqual({
		view: "ACTIVE",
		limit: 10,
		offset: 0,
	});
	for (const input of [
		{ limit: 51 },
		{ limit: 0 },
		{ offset: -1 },
		{ offset: 0.5 },
		{ view: "ALL" },
		{ creatorId: "forged" },
	])
		expect(listBroadcastsSchema.safeParse(input).success).toBe(false);
	expect(broadcastIdSchema.safeParse({ broadcastId: "bad" }).success).toBe(
		false,
	);
	expect(
		updateBroadcastSchema.safeParse({
			...valid,
			broadcastId: crypto.randomUUID(),
			createdByUserId: "forged",
		}).success,
	).toBe(false);
});

test("broadcast routes are protected and expose no delete/restore endpoint", async () => {
	const caller = broadcastRouter.createCaller({
		db: {} as Database,
		session: null,
	});
	for (const request of [
		() => caller.list({}),
		() => caller.latest(),
		() => caller.detail({ broadcastId: crypto.randomUUID() }),
		() => caller.create({ title: "Test", content: "Test" }),
		() =>
			caller.update({
				broadcastId: crypto.randomUUID(),
				title: "Test",
				content: "Test",
			}),
		() => caller.archive({ broadcastId: crypto.randomUUID() }),
	])
		await expect(request()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	expect(Object.keys(broadcastRouter._def.procedures).sort()).toEqual([
		"archive",
		"create",
		"detail",
		"latest",
		"list",
		"update",
	]);
});

test("permission revocation is rechecked before writing and failures are sanitized", async () => {
	let inserts = 0;
	const tx = {
		select: () => ({
			from: () => ({ where: () => ({ for: async () => [] }) }),
		}),
		insert: () => {
			inserts++;
		},
	};
	const db = {
		transaction: async (run: (value: unknown) => Promise<unknown>) => run(tx),
	} as unknown as Database;
	await expect(
		createBroadcast(db, identity, { title: "Test", content: "Test" }),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(inserts).toBe(0);
	const broken = {
		transaction: async () => {
			throw Error("SQL password secret connection-string");
		},
	} as unknown as Database;
	await expect(
		createBroadcast(broken, identity, { title: "Test", content: "Test" }),
	).rejects.toMatchObject({
		message: "BROADCAST_REQUEST_FAILED",
		code: "INTERNAL_SERVER_ERROR",
	});
	await expect(
		listBroadcasts(
			db,
			{ ...identity, isActive: false },
			listBroadcastsSchema.parse({}),
		),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("expiry boundaries use an explicit server clock and never reset the original publication window", () => {
	const publishedAt = new Date("2026-01-01T00:00:00Z");
	const expiresAt = new Date("2026-01-08T00:00:00Z");
	const row = { publishedAt, expiresAt, archivedAt: null };
	expect(resolveBroadcastExpiry(undefined, publishedAt, publishedAt)).toEqual(
		expiresAt,
	);
	expect(isBroadcastActive(row, publishedAt)).toBe(true);
	expect(isBroadcastActive(row, new Date(expiresAt.getTime() - 1))).toBe(true);
	expect(isBroadcastActive(row, expiresAt)).toBe(false);
	expect(isBroadcastActive(row, new Date(publishedAt.getTime() - 1))).toBe(
		false,
	);
	expect(
		isBroadcastActive({ ...row, archivedAt: publishedAt }, publishedAt),
	).toBe(false);
	const now = new Date("2026-01-05T00:00:00Z");
	expect(
		resolveBroadcastExpiry(undefined, publishedAt, now, expiresAt),
	).toEqual(expiresAt);
	for (const value of [publishedAt.toISOString(), now.toISOString(), "invalid"])
		expect(() => resolveBroadcastExpiry(value, publishedAt, now)).toThrow(
			"BROADCAST_EXPIRATION_INVALID",
		);
	expect(() =>
		resolveBroadcastExpiry("2026-01-08T00:00:00.001Z", publishedAt, now),
	).toThrow("BROADCAST_EXPIRATION_EXCEEDS_SEVEN_DAYS");
});
