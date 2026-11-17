import { expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { t } from "../index";
import {
	AttendanceLocationError,
	attendanceLocationDiagnostic,
} from "./attendance-diagnostics";

const diagnostic = {
	code: "OUTSIDE_GEOFENCE" as const,
	distanceMeters: 35.1,
	radiusMeters: 20,
	accuracyMeters: 12.5,
};

test("location diagnostic projects only finite rounded numeric fields from the dedicated server error", () => {
	const cause = new AttendanceLocationError({
		...diagnostic,
		latitude: 12,
		qrToken: "private-token",
	} as typeof diagnostic);
	expect(attendanceLocationDiagnostic(cause)).toEqual({
		code: "OUTSIDE_GEOFENCE",
		distanceMeters: 36,
		radiusMeters: 20,
		accuracyMeters: 13,
	});
	expect(attendanceLocationDiagnostic({ diagnostic })).toBeNull();
	for (const field of [
		"distanceMeters",
		"radiusMeters",
		"accuracyMeters",
	] as const)
		for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1])
			expect(
				attendanceLocationDiagnostic(
					new AttendanceLocationError({ ...diagnostic, [field]: value }),
				),
			).toBeNull();
});

test("tRPC exposes bounded location metadata only for the attendance mutation, never stack or unrelated causes", () => {
	for (const path of ["attendance.checkIn", "attendance.detail"]) {
		const error = new TRPCError({
			code: "FORBIDDEN",
			message: "OUTSIDE_GEOFENCE",
			cause: new AttendanceLocationError(diagnostic),
		});
		const result = t._config.errorFormatter({
			error,
			path,
			type: "mutation",
			input: undefined,
			ctx: undefined,
			shape: {
				message: error.message,
				code: -32003,
				data: {
					code: "FORBIDDEN",
					httpStatus: 403,
					path,
					stack: "private-stack",
				},
			},
		});
		expect(result.data.attendanceLocation).toEqual(
			path === "attendance.checkIn"
				? {
						code: "OUTSIDE_GEOFENCE",
						distanceMeters: 36,
						radiusMeters: 20,
						accuracyMeters: 13,
					}
				: null,
		);
		expect(JSON.stringify(result)).not.toContain("private-stack");
	}
	const error = new TRPCError({
		code: "FORBIDDEN",
		message: "NOT_INVITED",
		cause: new Error("private-coordinates"),
	});
	const result = t._config.errorFormatter({
		error,
		path: "attendance.checkIn",
		type: "mutation",
		input: undefined,
		ctx: undefined,
		shape: {
			message: error.message,
			code: -32003,
			data: { code: "FORBIDDEN", httpStatus: 403 },
		},
	});
	expect(result.data.attendanceLocation).toBeNull();
	expect(JSON.stringify(result)).not.toContain("private-coordinates");
});
