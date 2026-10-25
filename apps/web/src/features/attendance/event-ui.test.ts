import { expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import {
	isInvited,
	resetEventOrganization,
	setParticipantInvitation,
} from "./roster-selection";

test("committee defaults and frozen invitees override structural groups without duplicating IDs", () => {
	const member = {
		userId: "member",
		name: "Synthetic member",
		nim: "001",
		departmentCode: "HCO",
		positionCode: "ANGGOTA",
	};
	const guest = { ...member, userId: "guest" };
	let criteria = {
		allSr: false,
		inti: false,
		kadep: false,
		departments: [],
		individuals: [],
		include: [],
		exclude: [],
	} as Parameters<typeof isInvited>[1];
	const defaults = new Set([member.userId]);
	expect(isInvited(member, criteria, defaults)).toBe(true);
	expect(isInvited(guest, criteria, defaults)).toBe(false);
	criteria = setParticipantInvitation(criteria, member, false, defaults);
	expect(criteria.exclude).toEqual([member.userId]);
	criteria = setParticipantInvitation(criteria, member, true, defaults);
	expect(criteria.include).toEqual([]);
	expect(criteria.exclude).toEqual([]);
	criteria = setParticipantInvitation(criteria, guest, true, defaults);
	expect(criteria.include).toEqual([guest.userId]);
	criteria = setParticipantInvitation(criteria, guest, false, defaults);
	expect(isInvited(guest, criteria, defaults)).toBe(false);
	// A published snapshot is the default set even when live membership has changed.
	expect(isInvited(member, criteria, new Set())).toBe(false);
	const reset = resetEventOrganization(
		{
			rosterCriteria: { ...criteria, allSr: true, include: [guest.userId] },
			title: "Retained",
		},
		"COMMITTEE",
		"synthetic-committee",
	);
	expect(reset).toMatchObject({
		title: "Retained",
		committeeId: "synthetic-committee",
		organizationContext: "COMMITTEE",
		rosterCriteria: { allSr: false, include: [], exclude: [] },
	});
	expect(resetEventOrganization(reset, "SR").committeeId).toBeNull();
});

import {
	eventErrorMessage,
	formatEventTime,
	parseWibDateTimeInput,
	toWibDateTimeInput,
} from "./event-ui";

test("advanced edit errors explain stale eligibility and end-time restrictions safely", () => {
	expect(
		eventErrorMessage(new TRPCClientError("ADVANCED_EDIT_STATE_CHANGED")),
	).toContain("kehadiran telah berubah");
	expect(
		eventErrorMessage(new TRPCClientError("ADVANCED_EDIT_END_INVALID")),
	).toContain("tidak boleh di masa lalu");
});

test("visibility and deletion errors describe restrictions without exposing internal details", () => {
	expect(
		eventErrorMessage(new TRPCClientError("EVENT_VISIBILITY_CONFLICT")),
	).toContain("Visibilitas atau status");
	expect(
		eventErrorMessage(new TRPCClientError("HIDDEN_EVENT_ACTIVATION_FORBIDDEN")),
	).toContain("SUPERADMIN");
	expect(
		eventErrorMessage(new TRPCClientError("DRAFT_DELETE_NOT_ALLOWED")),
	).toContain("tidak dapat dihapus");
});

test("draft and manual input use explicit WIB independent of device timezone", () => {
	expect(toWibDateTimeInput("2026-10-12T06:00:00Z")).toBe("2026-10-12T13:00");
	expect(parseWibDateTimeInput("2026-10-12T13:00").toISOString()).toBe(
		"2026-10-12T06:00:00.000Z",
	);
	expect(toWibDateTimeInput("2026-10-12T06:00:15Z", true)).toBe(
		"2026-10-12T13:00:15",
	);
	expect(parseWibDateTimeInput("2026-10-12T13:00:15").toISOString()).toBe(
		"2026-10-12T06:00:15.000Z",
	);
});
test("WIB conversion handles day boundaries and invalid input keeps validation effective", () => {
	expect(toWibDateTimeInput("2026-10-12T23:30:00Z")).toBe("2026-10-13T06:30");
	expect(parseWibDateTimeInput("2026-10-13T06:30").toISOString()).toBe(
		"2026-10-12T23:30:00.000Z",
	);
	expect(Number.isFinite(parseWibDateTimeInput("").getTime())).toBe(false);
});
test("attendance display includes WIB and uses Jakarta rather than host timezone", () => {
	const output = formatEventTime("2026-10-12T06:00:00Z");
	expect(output).toContain("13.00");
	expect(output).toContain("WIB");
});
