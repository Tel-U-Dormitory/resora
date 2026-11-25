import { expect, test } from "bun:test";
import {
	createViolationSchema,
	updateViolationSchema,
	violationsListSchema,
	violationUploadIntentSchema,
} from "./violations.contracts";

test("contracts apply safe paging defaults and reject deleted-view PII filters", () => {
	expect(violationsListSchema.parse({})).toMatchObject({
		view: "ACTIVE",
		limit: 20,
		offset: 0,
	});
	expect(
		violationsListSchema.safeParse({ view: "DELETED", query: "NIM" }).success,
	).toBe(false);
	expect(violationsListSchema.safeParse({ limit: 51 }).success).toBe(false);
});

test("create contract requires an explicit building confirmation and supported image type", () => {
	expect(
		violationUploadIntentSchema.safeParse({ contentType: "image/svg+xml" })
			.success,
	).toBe(false);
	expect(
		createViolationSchema.safeParse({
			studentName: "Resident",
			studentNim: "123456",
			incidentDate: "2026-11-25",
			description: "Synthetic report",
			uploadIntentId: "d9e9d9e9-1111-4111-8111-111111111111",
			idempotencyKey: "d9e9d9e9-2222-4222-8222-222222222222",
		}).success,
	).toBe(false);
});

test("create contract rejects incident dates in the future", () => {
	expect(
		createViolationSchema.safeParse({
			studentName: "Resident",
			studentNim: "123456",
			incidentDate: "9999-12-31",
			description: "Synthetic report",
			uploadIntentId: "d9e9d9e9-1111-4111-8111-111111111111",
			idempotencyKey: "d9e9d9e9-2222-4222-8222-222222222222",
			confirmedBuildingId: "d9e9d9e9-3333-4333-8333-333333333333",
		}).success,
	).toBe(false);
});

test("update contract requires a reason, a change, and rejects future dates", () => {
	const reportId = "d9e9d9e9-1111-4111-8111-111111111111";
	const base = { reportId, expectedVersion: 1, reason: "Correcting a typo" };
	expect(updateViolationSchema.safeParse(base).success).toBe(false);
	expect(
		updateViolationSchema.safeParse({ ...base, studentName: "Resident" })
			.success,
	).toBe(true);
	expect(
		updateViolationSchema.safeParse({
			...base,
			incidentDate: "9999-12-31",
		}).success,
	).toBe(false);
	expect(
		updateViolationSchema.safeParse({
			reportId,
			expectedVersion: 1,
			studentName: "Resident",
		}).success,
	).toBe(false);
});

test("text contracts reject control characters but preserve plain-text markup", () => {
	const base = {
		studentName: "<Resident>",
		studentNim: "123456",
		incidentDate: "2026-11-25",
		description: "line one\nline two",
		uploadIntentId: "d9e9d9e9-1111-4111-8111-111111111111",
		idempotencyKey: "d9e9d9e9-2222-4222-8222-222222222222",
		confirmedBuildingId: "d9e9d9e9-3333-4333-8333-333333333333",
	};
	expect(createViolationSchema.safeParse(base).success).toBe(true);
	expect(
		createViolationSchema.safeParse({
			...base,
			description: "bad\u0000input",
		}).success,
	).toBe(false);
});
