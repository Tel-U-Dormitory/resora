import { expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import {
	isValidSrAssignment,
	officialDepartments,
	officialPositions,
} from "@resora/db/organization";
import { parseChallenge, signChallenge } from "../check-in/qr";
import { resolveCommitteeRoster, resolveRoster } from "../events/roster";
import type { SrCandidate } from "../identity/identity.public";
import { eventDraftSchema, rosterSchema } from "./attendance.schema";

test("committee roster intersects eligibility, deduplicates explicit invitations and applies exclusion last", () => {
	const members = [
		{
			userId: "hco",
			committeeDivision: "Acara",
			committeePosition: "PIC1" as const,
		},
		{
			userId: "inactive",
			committeeDivision: "Acara",
			committeePosition: "PJ" as const,
		},
	];
	const result = resolveCommitteeRoster(
		directory,
		rosterSchema.parse({
			include: ["hco", "member", "member"],
			exclude: ["hco"],
		}),
		members,
	);
	expect(result.map((sr) => sr.userId)).toEqual(["member"]);
	expect(result[0]).toMatchObject({
		committeeDivision: null,
		committeePosition: null,
	});
	expect(
		resolveCommitteeRoster(directory, rosterSchema.parse({}), members)[0],
	).toMatchObject({
		userId: "hco",
		committeeDivision: "Acara",
		committeePosition: "PIC1",
	});
	expect(
		resolveCommitteeRoster(
			directory,
			rosterSchema.parse({}),
			members,
			new Set(),
		),
	).toEqual([]);
});

test("event context rejects missing committee, structural groups mixed into committee and SR committee IDs", () => {
	const base = {
		title: "Test",
		startsAt: "2030-01-01T00:00:00Z",
		endsAt: "2030-01-01T01:00:00Z",
		rosterCriteria: {},
		session: { centerLat: 0, centerLng: 0 },
	};
	expect(eventDraftSchema.safeParse(base).success).toBe(true);
	expect(
		eventDraftSchema.safeParse({
			...base,
			organizationContext: "COMMITTEE",
			committeeId: randomUUID(),
		}).success,
	).toBe(true);
	for (const patch of [
		{ organizationContext: "COMMITTEE" },
		{ organizationContext: "SR", committeeId: randomUUID() },
		...[
			{ allSr: true },
			{ inti: true },
			{ kadep: true },
			{ departments: ["HCO"] },
		].map((rosterCriteria) => ({
			organizationContext: "COMMITTEE",
			committeeId: randomUUID(),
			rosterCriteria,
		})),
	])
		expect(eventDraftSchema.safeParse({ ...base, ...patch }).success).toBe(
			false,
		);
});

test("all official organization combinations follow INTI/department position split", () => {
	let accepted = 0;
	for (const department of officialDepartments)
		for (const position of officialPositions) {
			const expected =
				department.code === "INTI"
					? ["KETUM", "WAKETUM", "SEKRETARIS", "BENDAHARA"].includes(
							position.code,
						)
					: ["KADEP", "SEKDEP", "ANGGOTA"].includes(position.code);
			expect(isValidSrAssignment(department.code, position.code)).toBe(
				expected,
			);
			if (expected) accepted++;
		}
	expect(accepted).toBe(25);
	expect(isValidSrAssignment("UNKNOWN", "ANGGOTA")).toBe(false);
	expect(isValidSrAssignment("HCO", "KADIV")).toBe(false);
});
const candidate = (
	userId: string,
	departmentCode: string,
	positionCode: string,
): SrCandidate => ({
	userId,
	nim: `000${userId}`,
	name: userId,
	departmentCode,
	positionCode,
	buildingId: randomUUID(),
	buildingCode: "A",
	buildingName: "Gedung A",
});
const directory = [
	candidate("inti", "INTI", "KETUM"),
	candidate("hco", "HCO", "KADEP"),
	candidate("rnd", "RND", "KADEP"),
	candidate("member", "HCO", "ANGGOTA"),
];
const roster = (input: object) =>
	resolveRoster(directory, rosterSchema.parse(input)).map((sr) => sr.userId);
test("INTI and KADEP union is department-based and deduplicated", () => {
	expect(roster({ inti: true })).toEqual(["inti"]);
	expect(roster({ kadep: true })).toEqual(["hco", "rnd"]);
	expect(
		roster({
			inti: true,
			kadep: true,
			departments: ["INTI", "HCO"],
			individuals: ["hco"],
		}),
	).toEqual(["hco", "inti", "member", "rnd"]);
});
test("all SR, individual, manual include/exclude compose with exclusion winning", () => {
	expect(
		roster({ allSr: true, include: ["hco"], exclude: ["hco", "member"] }),
	).toEqual(["inti", "rnd"]);
	expect(
		roster({
			individuals: ["inti"],
			include: ["member", "not-a-candidate"],
			exclude: ["inti"],
		}),
	).toEqual(["member"]);
	expect(roster({})).toEqual([]);
});
test("signed QR redisplays identically, rejects tampering and binds to session", () => {
	const secret = randomBytes(32).toString("hex");
	const sessionId = randomUUID();
	const challengeId = randomUUID();
	const token = signChallenge(secret, sessionId, challengeId);
	expect(signChallenge(secret, sessionId, challengeId) === token).toBe(true);
	expect(parseChallenge(secret, token, sessionId) === challengeId).toBe(true);
	expect(parseChallenge(secret, token, randomUUID())).toBeNull();
	expect(
		parseChallenge(
			secret,
			`${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`,
			sessionId,
		),
	).toBeNull();
	expect(
		parseChallenge(randomBytes(32).toString("hex"), token, sessionId),
	).toBeNull();
	expect(parseChallenge(secret, "malformed", sessionId)).toBeNull();
	expect(() => signChallenge("short", sessionId, challengeId)).toThrow();
});
