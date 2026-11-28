import { expect, test } from "bun:test";
import { getAppItems, getSidebarGroups } from "@/config/navigation";
import {
	dtStatusBadgeClass,
	dtStatusLabel,
	formatDtPeriodRange,
} from "./dt-ui";

test("desktop sidebar and mobile Apps navbar include Kelola DT for ADAPTIF and SUPERADMIN", () => {
	const adaptifCaps = {
		isSr: true,
		departmentCode: "ADAPTIF",
		canManageEvents: false,
		canManageDt: true,
		isSuperadmin: false,
	};
	const adaptifGroups = getSidebarGroups(adaptifCaps);
	expect(
		adaptifGroups.some(
			(g) =>
				g.title === "Departemen · ADAPTIF" &&
				g.items.some((item) => item.href === "/dt" && item.title === "Kelola DT"),
		),
	).toBe(true);
	expect(
		getAppItems(adaptifCaps).some(
			(item) => item.href === "/dt" && item.title === "Kelola DT",
		),
	).toBe(true);

	const superadminCaps = {
		isSr: false,
		departmentCode: null,
		canManageEvents: true,
		canManageCommittee: true,
		canAccessPenilaianWorkspace: true,
		canManageDt: true,
		isSuperadmin: true,
	};
	const superadminGroups = getSidebarGroups(superadminCaps);
	expect(
		superadminGroups.some((g) =>
			g.items.some((item) => item.href === "/dt" && item.title === "Kelola DT"),
		),
	).toBe(true);
	expect(
		getAppItems(superadminCaps).some(
			(item) => item.href === "/dt" && item.title === "Kelola DT",
		),
	).toBe(true);

	const nonAdaptifCaps = {
		isSr: true,
		departmentCode: "RND",
		canManageEvents: false,
		canManageDt: false,
		isSuperadmin: false,
	};
	expect(
		getSidebarGroups(nonAdaptifCaps).some((g) =>
			g.items.some((item) => item.href === "/dt"),
		),
	).toBe(false);
	expect(
		getAppItems(nonAdaptifCaps).some((item) => item.href === "/dt"),
	).toBe(false);

	const dtGroups = getSidebarGroups({
		isSr: false,
		isDt: true,
		departmentCode: "ADAPTIF",
		canManageEvents: false,
		canManageDt: false,
		isSuperadmin: false,
	});
	const dtHrefs = dtGroups.flatMap((g) => g.items.map((i) => i.href));
	expect(dtHrefs).toContain("/dt");
	expect(dtHrefs).toContain("/events");
	expect(dtHrefs).toContain("/scan");
	expect(dtHrefs).toContain("/attendance/history");
	expect(dtHrefs).not.toContain("/broadcasts");
});

test("DT UI helpers format status badges and date ranges", () => {
	expect(dtStatusLabel("CANDIDATE")).toBe("Calon (Menunggu Review)");
	expect(dtStatusLabel("EXPIRED")).toBe("Periode Berakhir");
	expect(dtStatusBadgeClass("ACTIVE")).toContain("success");
	expect(dtStatusBadgeClass("ENDED")).toContain("danger");
	expect(formatDtPeriodRange(null, null)).toBe("Periode belum ditetapkan");
});
