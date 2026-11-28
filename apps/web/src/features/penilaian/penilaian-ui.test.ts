import { describe, expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import {
	buildGformCsvPreviewRows,
	formatPenilaianScore,
	formatPeriodStatusLabel,
	formatTargetSubtitle,
	penilaianErrorMessage,
	penilaianStatusBadgeClass,
	sampleGformCsvTemplate,
} from "./penilaian-ui";

describe("penilaian UI helpers", () => {
	test("formatTargetSubtitle avoids empty parentheses when committee metadata is null", () => {
		expect(
			formatTargetSubtitle({
				departmentCode: "RND",
				committeeDivision: null,
				committeePosition: null,
				fallbackLabel: "Peserta Event",
			}),
		).toBe("RND · Peserta Event");
		expect(
			formatTargetSubtitle({
				departmentCode: "HCO",
				committeeDivision: "Acara",
				committeePosition: "KADEP",
				fallbackLabel: "Peserta Event",
			}),
		).toBe("HCO · Panitia: Acara (KADEP)");
	});

	test("formatPenilaianScore formats numbers and handles nullish values without faking zero", () => {
		expect(formatPenilaianScore(null)).toBe("—");
		expect(formatPenilaianScore(undefined)).toBe("—");
		expect(formatPenilaianScore(158.5)).toBe("158,5");
		expect(formatPenilaianScore(0)).toBe("0");
	});

	test("formatPeriodStatusLabel maps period and readiness labels", () => {
		expect(formatPeriodStatusLabel("OPEN")).toBe("Terbuka (Berjalan)");
		expect(formatPeriodStatusLabel("FINAL")).toBe("Final");
		expect(formatPeriodStatusLabel("REVISING")).toBe("Revisi Terbuka");
		expect(formatPeriodStatusLabel("BELUM_FINAL")).toBe("Belum Final");
		expect(formatPeriodStatusLabel("SIAP_DIFINALISASI")).toBe(
			"Siap difinalisasi",
		);
	});

	test("penilaianStatusBadgeClass returns semantic token classes without raw hex", () => {
		for (const status of [
			"FINAL",
			"REVISING",
			"INVALID",
			"BELUM_LENGKAP",
			"OTHER",
		]) {
			const cls = penilaianStatusBadgeClass(status);
			expect(cls.includes("#")).toBe(false);
		}
	});

	test("sampleGformCsvTemplate and buildGformCsvPreviewRows round-trip cleanly", () => {
		const srMabaCsv = sampleGformCsvTemplate("SR_MABA");
		const parsedSrMaba = buildGformCsvPreviewRows(srMabaCsv, "SR_MABA");
		expect(parsedSrMaba).toHaveLength(1);
		expect(parsedSrMaba[0]?.answers).toHaveLength(20);
		expect(parsedSrMaba[0]?.targetNim).toBe("1301220001");

		const extCsv = sampleGformCsvTemplate("EXTERNAL_ASUS_DITMAWA");
		const parsedExt = buildGformCsvPreviewRows(extCsv, "EXTERNAL_ASUS_DITMAWA");
		expect(parsedExt).toHaveLength(1);
		expect(parsedExt[0]?.answers).toHaveLength(10);
		expect(parsedExt[0]?.respondentRole).toBe("ASUS");
	});

	test("penilaianErrorMessage maps domain error codes to Indonesian messages", () => {
		expect(
			penilaianErrorMessage(
				new TRPCClientError("EVALUATION_INCOMPLETE_CANNOT_FINALIZE"),
			),
		).toContain("komponen wajib belum lengkap");
		expect(
			penilaianErrorMessage(new TRPCClientError("SELF_EVALUATION_NOT_ALLOWED")),
		).toContain("diri sendiri");
		expect(penilaianErrorMessage(new Error("unknown"))).toContain(
			"belum dapat memproses permintaan",
		);
	});
});
