import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ActiveSrIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { committeePositionCodes } from "@resora/db/schema/committee";
import { committeeRouter } from "./committee.router";
import {
	candidateSchema,
	committeeFieldsSchema,
	listCommitteesSchema,
	memberSchema,
	updateDivisionSchema,
} from "./committee.schema";
import { createCommittee, listCommittees } from "./committee.service";

const identity: ActiveSrIdentity = {
	userId: "synthetic-operator",
	actor: "SR",
	nim: "0000000001",
	isActive: true,
	mustChangePassword: false,
	departmentCode: "HCO",
	positionCode: "KADEP",
	buildingId: randomUUID(),
	isSuperadmin: false,
};

test("committee input boundaries trim names, bound pagination and reject forged claims", () => {
	expect(
		committeeFieldsSchema.parse({ name: "  Welday  ", description: " Test " }),
	).toEqual({ name: "Welday", description: "Test" });
	expect(listCommitteesSchema.parse({})).toEqual({
		search: "",
		limit: 20,
		offset: 0,
	});
	for (const input of [
		{ name: " " },
		{ name: "x".repeat(151) },
		{ name: "X", description: "x".repeat(2001) },
		{ name: "X", createdByUserId: "forged" },
	])
		expect(committeeFieldsSchema.safeParse(input).success).toBe(false);
	for (const input of [
		{ limit: 51 },
		{ limit: 0 },
		{ offset: -1 },
		{ offset: 1.5 },
		{ search: "x".repeat(151) },
	])
		expect(listCommitteesSchema.safeParse(input).success).toBe(false);
	expect(
		candidateSchema.safeParse({ committeeId: randomUUID(), search: "a" })
			.success,
	).toBe(false);
	expect(
		updateDivisionSchema.safeParse({
			committeeId: randomUUID(),
			divisionId: randomUUID(),
			name: " acara ",
		}).data?.name,
	).toBe("acara");
});
test("membership uses exactly Phase 1 position codes and rejects extra permissions", () => {
	const input = {
		committeeId: randomUUID(),
		userId: "synthetic-sr",
		divisionId: randomUUID(),
		positionCode: "ANGGOTA",
	};
	for (const positionCode of committeePositionCodes)
		expect(memberSchema.safeParse({ ...input, positionCode }).success).toBe(
			true,
		);
	for (const positionCode of ["KETUM", "SUPERADMIN", "anggota", ""])
		expect(memberSchema.safeParse({ ...input, positionCode }).success).toBe(
			false,
		);
	expect(memberSchema.safeParse({ ...input, isSuperadmin: true }).success).toBe(
		false,
	);
});

for (const [label, patch] of [
	["SEKDEP HCO", { positionCode: "SEKDEP" }],
	["ANGGOTA HCO", { positionCode: "ANGGOTA" }],
	["KADEP RND", { departmentCode: "RND" }],
	["inactive", { isActive: false }],
	["invalid assignment", { positionCode: "KETUM" }],
	["gated superadmin", { isSuperadmin: true, mustChangePassword: true }],
] as const)
	test(`${label} is denied before a write transaction`, async () => {
		let transactions = 0;
		const db = {
			transaction: () => {
				transactions++;
				throw Error("unexpected write");
			},
		} as unknown as Database;
		await expect(
			createCommittee(
				db,
				{ ...identity, ...patch },
				{ name: "Test", description: "" },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(transactions).toBe(0);
	});

test("ordinary SR cannot read; anonymous router requests do not touch the database", async () => {
	const db = {
		select: () => {
			throw Error("unexpected read");
		},
	} as unknown as Database;
	await expect(
		listCommittees(
			db,
			{ ...identity, departmentCode: "RND", positionCode: "ANGGOTA" },
			listCommitteesSchema.parse({}),
		),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	const caller = committeeRouter.createCaller({ db, session: null });
	await expect(caller.list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	await expect(caller.create({ name: "Test" })).rejects.toMatchObject({
		code: "UNAUTHORIZED",
	});
});

test("stale operator identity is rechecked inside the transaction before create", async () => {
	let inserts = 0;
	let transactions = 0;
	const tx = {
		select: () => ({
			from: () => ({ where: () => ({ for: async () => [] }) }),
		}),
		insert: () => {
			inserts++;
			throw Error("unexpected write");
		},
	};
	const db = {
		transaction: async (run: (value: unknown) => Promise<unknown>) => {
			transactions++;
			return run(tx);
		},
	} as unknown as Database;
	await expect(
		createCommittee(db, identity, { name: "Test", description: "" }),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(transactions).toBe(1);
	expect(inserts).toBe(0);
});
