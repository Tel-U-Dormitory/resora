import { z } from "zod";

export const dtEffectiveStatuses = [
	"CANDIDATE",
	"ACTIVE",
	"EXPIRED",
	"ENDED",
	"REJECTED",
	"ARCHIVED",
] as const;
export type DtEffectiveStatus = (typeof dtEffectiveStatuses)[number];

export const DT_STATUS_LABELS: Record<DtEffectiveStatus, string> = {
	CANDIDATE: "Calon (Menunggu Review)",
	ACTIVE: "Aktif",
	EXPIRED: "Periode Berakhir",
	ENDED: "Diakhiri",
	REJECTED: "Ditolak",
	ARCHIVED: "Diarsipkan",
};

const dateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Gunakan format tanggal YYYY-MM-DD")
	.refine((value) => {
		const [yearStr, monthStr, dayStr] = value.split("-");
		const year = Number(yearStr);
		const month = Number(monthStr);
		const day = Number(dayStr);
		const d = new Date(Date.UTC(year, month - 1, day));
		return (
			d.getUTCFullYear() === year &&
			d.getUTCMonth() === month - 1 &&
			d.getUTCDate() === day
		);
	}, "Tanggal kalender tidak valid");

const optionalTrimmedText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.transform((v) => (v.length ? v : null))
		.nullable()
		.optional();

export const dtMembershipIdSchema = z
	.object({
		membershipId: z.uuid(),
	})
	.strict();

export const registerDtCandidateSchema = z
	.object({
		name: z.string().trim().min(1).max(120),
		nim: z
			.string()
			.trim()
			.min(1)
			.max(64)
			.refine((v) => !/\s/.test(v), "NIM tidak boleh mengandung spasi"),
		email: z.string().trim().toLowerCase().email().max(255),
		periodName: z.string().trim().min(1).max(100),
		departmentCode: optionalTrimmedText(32),
		buildingId: z.uuid().nullable().optional(),
		workProgram: optionalTrimmedText(200),
		registrationNotes: z.string().trim().max(500).default(""),
	})
	.strict();

export const activateDtMembershipSchema = z
	.object({
		membershipId: z.uuid(),
		periodName: z.string().trim().min(1).max(100).optional(),
		startsOn: dateSchema,
		endsOn: dateSchema,
		departmentCode: optionalTrimmedText(32),
		buildingId: z.uuid().nullable().optional(),
		workProgram: optionalTrimmedText(200),
		reason: z.string().trim().min(1).max(500).default("Aktivasi anggota DT"),
	})
	.strict()
	.refine((input) => input.endsOn >= input.startsOn, {
		message: "Tanggal berakhir harus sama dengan atau setelah tanggal mulai",
		path: ["endsOn"],
	});

export const rejectDtCandidateSchema = z
	.object({
		membershipId: z.uuid(),
		reason: z.string().trim().min(1).max(500),
	})
	.strict();

export const extendDtPeriodSchema = z
	.object({
		membershipId: z.uuid(),
		endsOn: dateSchema,
		periodName: z.string().trim().min(1).max(100).optional(),
		reason: z.string().trim().min(1).max(500),
	})
	.strict();

export const endDtMembershipSchema = z
	.object({
		membershipId: z.uuid(),
		reason: z.string().trim().min(1).max(500),
	})
	.strict();

export const archiveDtMembershipSchema = z
	.object({
		membershipId: z.uuid(),
		reason: z
			.string()
			.trim()
			.min(1)
			.max(500)
			.default("Pengarsipan riwayat keanggotaan DT"),
	})
	.strict();

export const updateDtAssignmentSchema = z
	.object({
		membershipId: z.uuid(),
		departmentCode: optionalTrimmedText(32),
		buildingId: z.uuid().nullable().optional(),
		workProgram: optionalTrimmedText(200),
		reason: z.string().trim().min(1).max(500),
	})
	.strict();

export const listDtMembersSchema = z
	.object({
		search: z.string().trim().max(100).default(""),
		periodName: z.string().trim().max(100).default(""),
		departmentCode: z.string().trim().max(32).default(""),
		buildingId: z.uuid().optional(),
		status: z.enum(dtEffectiveStatuses).optional(),
		limit: z.number().int().min(1).max(50).default(20),
		offset: z.number().int().min(0).max(10_000).default(0),
	})
	.strict()
	.default({
		search: "",
		periodName: "",
		departmentCode: "",
		limit: 20,
		offset: 0,
	});

export function jakartaTodayDateString(now = new Date()): string {
	return new Intl.DateTimeFormat("sv-SE", {
		timeZone: "Asia/Jakarta",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

export function computeEffectiveDtStatus(
	row: {
		status: "CANDIDATE" | "ACTIVE" | "ENDED" | "REJECTED" | "ARCHIVED";
		startsOn: string | null;
		endsOn: string | null;
	},
	todayJakarta = jakartaTodayDateString(),
): DtEffectiveStatus {
	if (row.status === "ACTIVE") {
		if (row.endsOn && row.endsOn < todayJakarta) {
			return "EXPIRED";
		}
		return "ACTIVE";
	}
	return row.status;
}
