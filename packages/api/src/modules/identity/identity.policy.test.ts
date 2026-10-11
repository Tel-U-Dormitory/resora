import { expect, test } from "bun:test";
import {
	getAttendancePermissions,
	requirePilotProfile,
} from "./identity.policy";

test("pilot dashboard rejects missing, inactive and non-SR profiles", () => {
	expect(() => requirePilotProfile(undefined)).toThrow();
	expect(() => requirePilotProfile({ actor: "SR", isActive: false })).toThrow();
	for (const actor of ["MAHASISWA", "ASUS", "DITMAWA"]) {
		expect(() => requirePilotProfile({ actor, isActive: true })).toThrow();
	}
	const profile = { actor: "SR", isActive: true };
	expect(requirePilotProfile(profile)).toBe(profile);
});

test("HCO management and KADIV HCO manual permission remain separate", () => {
	const profile = {
		actor: "SR",
		isActive: true,
		departmentCode: "HCO",
		positionCode: "STAFF",
	};
	expect(getAttendancePermissions(profile)).toMatchObject({
		canCreateEvent: true,
		canManageQR: true,
		canExportReport: true,
		canManualEntry: false,
	});
	expect(
		getAttendancePermissions({ ...profile, positionCode: "KADIV" })
			.canManualEntry,
	).toBe(true);
	for (const departmentCode of [
		"Adaptif",
		"Sosial",
		"Akademik",
		"Spiritual",
		"Media",
		"RnD",
	]) {
		expect(
			getAttendancePermissions({
				...profile,
				departmentCode,
				positionCode: "KADIV",
			}),
		).toMatchObject({ canCreateEvent: false, canManualEntry: false });
	}
	expect(getAttendancePermissions({ ...profile, isActive: false }).isHCO).toBe(
		false,
	);
	expect(
		getAttendancePermissions({ ...profile, actor: "MAHASISWA" }).isHCO,
	).toBe(false);
});
