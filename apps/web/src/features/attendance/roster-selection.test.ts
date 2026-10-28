import { expect, test } from "bun:test";
import { resolveRoster } from "@resora/api/modules/events/roster";
import { participantPage } from "./participant-list";
import {
	isInvited,
	type RosterCandidate,
	setParticipantInvitation,
} from "./roster-selection";

const candidates = [
	{
		userId: "inti",
		nim: "0001",
		name: "Inti",
		departmentCode: "INTI",
		positionCode: "KETUM",
	},
	{
		userId: "hco",
		nim: "0002",
		name: "Hco",
		departmentCode: "HCO",
		positionCode: "KADEP",
	},
	{
		userId: "rnd",
		nim: "0003",
		name: "Rnd",
		departmentCode: "RND",
		positionCode: "KADEP",
	},
	{
		userId: "member",
		nim: "0004",
		name: "Member",
		departmentCode: "HCO",
		positionCode: "ANGGOTA",
	},
] as const satisfies readonly RosterCandidate[];
const empty = {
	allSr: false,
	inti: false,
	kadep: false,
	departments: [],
	individuals: [],
	include: [],
	exclude: [],
};

test("effective selection matches the existing backend union/dedup/exclude resolver", () => {
	const backendCandidates = candidates.map((sr) => ({
		...sr,
		buildingId: "synthetic-building",
		buildingCode: "A",
		buildingName: "Gedung A",
		mustChangePassword: false,
	}));
	for (const allSr of [false, true])
		for (const inti of [false, true])
			for (const kadep of [false, true]) {
				for (const departments of [[], ["HCO"], ["RND", "INTI"]] as const) {
					for (const overrides of [
						{ individuals: [], include: [], exclude: [] },
						{
							individuals: ["member", "member"],
							include: ["member", "hco"],
							exclude: ["hco"],
						},
						{
							individuals: ["not-in-directory"],
							include: ["inti"],
							exclude: ["inti", "rnd"],
						},
					]) {
						const criteria = {
							allSr,
							inti,
							kadep,
							departments: [...departments],
							...overrides,
						};
						expect(
							candidates
								.filter((sr) => isInvited(sr, criteria))
								.map((sr): string => sr.userId)
								.sort(),
						).toEqual(
							resolveRoster(backendCandidates, criteria)
								.map((sr) => sr.userId)
								.sort(),
						);
					}
				}
			}
});

test("group changes update effective selection without expanding group members to IDs", () => {
	const criteria = { ...empty, inti: true, kadep: true };
	expect(
		candidates.filter((sr) => isInvited(sr, criteria)).map((sr) => sr.userId),
	).toEqual(["inti", "hco", "rnd"]);
	expect(isInvited(candidates[0], { ...criteria, inti: false })).toBe(false);
	expect(isInvited(candidates[3], { ...criteria, allSr: true })).toBe(true);
	expect(criteria.include).toEqual([]);
});

test("individual selection canonically removes contradictory legacy overrides for the edited participant", () => {
	const sr = candidates[1];
	const legacy = {
		...empty,
		allSr: true,
		individuals: [sr.userId, sr.userId],
		include: [sr.userId],
		exclude: [sr.userId],
	};
	const checked = setParticipantInvitation(legacy, sr, true);
	expect(isInvited(sr, checked)).toBe(true);
	expect(checked.individuals).toEqual([]);
	expect(checked.include).toEqual([]);
	expect(checked.exclude).toEqual([]);
	const unchecked = setParticipantInvitation(checked, sr, false);
	expect(unchecked.exclude).toEqual([sr.userId]);
	expect(isInvited(sr, unchecked)).toBe(false);
	expect(isInvited(sr, setParticipantInvitation(unchecked, sr, true))).toBe(
		true,
	);
	const manual = setParticipantInvitation(empty, sr, true);
	expect(manual.include).toEqual([sr.userId]);
	expect(setParticipantInvitation(manual, sr, false)).toEqual(empty);
});

test("saved draft individual/include/exclude selections remain readable; editing one participant preserves the others", () => {
	const legacy = {
		...empty,
		individuals: ["inti"],
		include: ["member"],
		exclude: ["rnd"],
	};
	expect(
		candidates.filter((sr) => isInvited(sr, legacy)).map((sr) => sr.userId),
	).toEqual(["inti", "member"]);
	const updated = setParticipantInvitation(legacy, candidates[1], true);
	expect(updated.individuals).toEqual(["inti"]);
	expect(updated.include).toEqual(["member", "hco"]);
	expect(updated.exclude).toEqual(["rnd"]);
	expect(legacy.include).toEqual(["member"]);
});

test("participant pagination filters first, clamps boundaries and keeps the full snapshot unchanged", () => {
	const rows = Array.from({ length: 32 }, (_, index) => ({
		name: `Peserta ${index}`,
		nim: String(index).padStart(10, "0"),
	}));
	const before = structuredClone(rows);
	expect(participantPage(rows, "", 1).rows).toHaveLength(15);
	expect(participantPage(rows, "", 2).rows).toHaveLength(15);
	expect(participantPage(rows, "", 3).rows).toHaveLength(2);
	expect(participantPage(rows, "", 99).page).toBe(3);
	expect(participantPage(rows, "", 0).page).toBe(1);
	expect(participantPage(rows, " PESERTA 3 ", 3)).toMatchObject({
		page: 1,
		pages: 1,
		matching: 3,
	});
	expect(participantPage(rows, "0000000001", 1).rows[0]?.name).toBe(
		"Peserta 1",
	);
	expect(participantPage(rows, "missing", 2)).toMatchObject({
		page: 1,
		pages: 1,
		rows: [],
		matching: 0,
	});
	expect(participantPage([], "", 9).pages).toBe(1);
	expect(rows).toEqual(before);
});
