import { randomBytes } from "node:crypto";
import { appRouter } from "@resora/api/routers/index";
import { createAuth } from "@resora/auth";
import { createDb } from "@resora/db";
import {
	attendanceRecords,
	attendanceSessions,
	eventParticipants,
	events,
	qrChallenges,
} from "@resora/db/schema/attendance";
import { broadcasts } from "@resora/db/schema/broadcast";
import {
	committeeDivisions,
	committeeMembers,
	committees,
} from "@resora/db/schema/committee";
import {
	dtAssignmentHistories,
	dtAudits,
	dtMemberships,
} from "@resora/db/schema/dt";
import { userProfiles } from "@resora/db/schema/identity";
import {
	evaluationAttendanceFallbacks,
	evaluationAudits,
	evaluationDepartmentScores,
	evaluationEventScores,
	evaluationGformResponses,
	evaluationPeriodEvents,
	evaluationPeriods,
	evaluationPointTransactions,
} from "@resora/db/schema/penilaian";
import {
	violationsAudits,
	violationsReports,
} from "@resora/db/schema/violations";
import { ENV } from "../env.server";

const SEED_IDS = {
	broadcasts: [
		"d0000000-0000-4000-8000-000000000001",
		"d0000000-0000-4000-8000-000000000002",
		"d0000000-0000-4000-8000-000000000003",
	],
	committees: {
		dormFest: "d0000000-0000-4000-8000-000000000101",
		careerTalk: "d0000000-0000-4000-8000-000000000102",
	},
	divisions: {
		dfAcara: "d0000000-0000-4000-8000-000000000111",
		dfHumas: "d0000000-0000-4000-8000-000000000112",
		dfLogistik: "d0000000-0000-4000-8000-000000000113",
		dfDokum: "d0000000-0000-4000-8000-000000000114",
		ctMateri: "d0000000-0000-4000-8000-000000000121",
		ctOps: "d0000000-0000-4000-8000-000000000122",
		ctPublikasi: "d0000000-0000-4000-8000-000000000123",
	},
	events: {
		annualFest: "d0000000-0000-4000-8000-000000000201",
		monthlyOct: "d0000000-0000-4000-8000-000000000202",
		weeklyNov: "d0000000-0000-4000-8000-000000000203",
		upcomingRaker: "d0000000-0000-4000-8000-000000000204",
		upcomingCareer: "d0000000-0000-4000-8000-000000000205",
		draftMubes: "d0000000-0000-4000-8000-000000000206",
		dtBriefingDone: "d0000000-0000-4000-8000-000000000207",
		dtQrLive: "d0000000-0000-4000-8000-000000000208",
	},
	sessions: {
		annualFest: "d0000000-0000-4000-8000-000000000301",
		monthlyOct: "d0000000-0000-4000-8000-000000000302",
		weeklyNov: "d0000000-0000-4000-8000-000000000303",
		upcomingRaker: "d0000000-0000-4000-8000-000000000304",
		upcomingCareer: "d0000000-0000-4000-8000-000000000305",
		draftMubes: "d0000000-0000-4000-8000-000000000306",
		dtBriefingDone: "d0000000-0000-4000-8000-000000000307",
		dtQrLive: "d0000000-0000-4000-8000-000000000308",
	},
	dtMemberships: {
		activeA: "d0000000-0000-4000-8000-000000000901",
		activeB: "d0000000-0000-4000-8000-000000000902",
		candidateC: "d0000000-0000-4000-8000-000000000903",
	},
	dtAssignments: {
		activeA: "d0000000-0000-4000-8000-000000000911",
		activeB: "d0000000-0000-4000-8000-000000000912",
	},
	dtAudits: {
		aReg: "d0000000-0000-4000-8000-000000000921",
		aAct: "d0000000-0000-4000-8000-000000000922",
		bReg: "d0000000-0000-4000-8000-000000000923",
		bAct: "d0000000-0000-4000-8000-000000000924",
		cReg: "d0000000-0000-4000-8000-000000000925",
	},
	evalPeriods: {
		triwulan1Final: "d0000000-0000-4000-8000-000000000401",
		triwulan2Open: "d0000000-0000-4000-8000-000000000402",
	},
	evalPeriodEvents: {
		p1Annual: "d0000000-0000-4000-8000-000000000411",
		p1Monthly: "d0000000-0000-4000-8000-000000000412",
		p1Weekly: "d0000000-0000-4000-8000-000000000413",
		p2Raker: "d0000000-0000-4000-8000-000000000414",
	},
} as const;

function uuidFromIndex(prefix: string, index: number) {
	return `${prefix}-${String(index).padStart(12, "0")}`;
}

function deterministicScore(seed: number, min: number, max: number) {
	const span = max - min + 1;
	return min + ((seed * 37 + 13) % span);
}

function buildTwentyAnswers(avgTarget: number, seed: number): number[] {
	const answers: number[] = [];
	for (let q = 0; q < 20; q++) {
		const jitter = ((seed + q * 3) % 3) - 1;
		const val = Math.min(5, Math.max(3, Math.round(avgTarget + jitter * 0.4)));
		answers.push(val);
	}
	return answers;
}

function buildTenAnswers(avgTarget: number, seed: number): number[] {
	const answers: number[] = [];
	for (let q = 0; q < 10; q++) {
		const jitter = ((seed + q * 5) % 3) - 1;
		const val = Math.min(5, Math.max(3, Math.round(avgTarget + jitter * 0.4)));
		answers.push(val);
	}
	return answers;
}

function ensureDevGuard() {
	if (ENV.NODE_ENV !== "development") {
		throw new Error(
			`REFUSING_NON_DEV_SEED: NODE_ENV must be development (got ${ENV.NODE_ENV})`,
		);
	}
	if (ENV.BETTER_AUTH_URL.includes("resora.telkomdormitory.com")) {
		throw new Error("REFUSING_PROD_ORIGIN_SEED");
	}
	if (!process.argv.includes("--apply")) {
		console.info(
			"Preview only. Pass --apply to seed realistic dummy data into development DB.",
		);
		process.exit(0);
	}
}

async function main() {
	ensureDevGuard();

	const db = createDb({ DATABASE_URL: ENV.DATABASE_URL });
	try {
		const srPeriodRes = await db.$client.query<{
			id: string;
			name: string;
			starts_on: string;
			ends_on: string;
		}>(
			"SELECT id, name, starts_on, ends_on FROM sr_periods ORDER BY starts_on ASC LIMIT 1",
		);
		const activeSrPeriod = srPeriodRes.rows[0];
		if (!activeSrPeriod) {
			throw new Error("NO_SR_PERIOD_FOUND_TO_SEED");
		}

		const rosterRes = await db.$client.query<{
			userId: string;
			name: string;
			username: string | null;
			isActive: boolean;
			departmentCode: string;
			positionCode: string;
			buildingId: string;
			buildingCode: string;
			buildingName: string;
		}>(
			`SELECT u.id AS "userId", u.name, u.username, up.is_active AS "isActive",
			        sp.department_code AS "departmentCode", sp.position_code AS "positionCode",
			        sp.building_id AS "buildingId", b.code AS "buildingCode", b.name AS "buildingName"
			 FROM sr_period_memberships m
			 JOIN sr_profiles sp ON sp.user_id = m.user_id
			 JOIN user_profiles up ON up.user_id = sp.user_id
			 JOIN "user" u ON u.id = sp.user_id
			 JOIN buildings b ON b.id = sp.building_id
			 WHERE m.period_id = $1 AND up.actor = 'SR'
			 ORDER BY u.username ASC NULLS LAST, u.id ASC`,
			[activeSrPeriod.id],
		);
		const rosterRows = rosterRes.rows;

		if (rosterRows.length === 0) {
			throw new Error("NO_ROSTER_MEMBERS_FOUND_IN_SR_PERIOD");
		}

		const pickUser = (username: string) =>
			rosterRows.find((r) => r.username === username);

		const devHco =
			pickUser("dev.hco") ??
			rosterRows.find(
				(r) =>
					r.departmentCode === "HCO" &&
					r.positionCode === "KADEP" &&
					r.isActive,
			);
		const testInti =
			pickUser("0000000002") ??
			pickUser("ketum") ??
			rosterRows.find((r) => r.departmentCode === "INTI" && r.isActive);
		const altInti =
			pickUser("ketum") !== testInti
				? pickUser("ketum")
				: (pickUser("waketum") ?? testInti);
		const devKadepRnd =
			pickUser("dev.kadep") ??
			rosterRows.find(
				(r) =>
					r.departmentCode === "RND" &&
					r.positionCode === "KADEP" &&
					r.isActive,
			);
		const devAnggota =
			pickUser("dev.anggota") ??
			rosterRows.find(
				(r) =>
					r.departmentCode === "RND" &&
					r.positionCode === "ANGGOTA" &&
					r.isActive,
			);

		if (!devHco || !testInti || !altInti || !devKadepRnd || !devAnggota) {
			throw new Error("CORE_SR_ACCOUNTS_MISSING_IN_DEV_ROSTER");
		}

		const kadepByDept = new Map<string, (typeof rosterRows)[number]>();
		for (const member of rosterRows) {
			if (member.positionCode === "KADEP" && member.isActive) {
				if (!kadepByDept.has(member.departmentCode)) {
					kadepByDept.set(member.departmentCode, member);
				}
			}
		}
		// Prefer dev.kadep for RND and dev.hco for HCO.
		kadepByDept.set("HCO", devHco);
		kadepByDept.set("RND", devKadepRnd);

		const allBuildingsRes = await db.$client.query<{
			id: string;
			code: string;
			name: string;
		}>("SELECT id, code, name FROM buildings ORDER BY code ASC");
		const allBuildings = allBuildingsRes.rows;

		const now = new Date();
		const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
		const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3600_000);
		const daysFromNow = (d: number, hourUtc = 12) => {
			const dt = new Date(now.getTime() + d * 86_400_000);
			dt.setUTCHours(hourUtc, 0, 0, 0);
			return dt;
		};

		// Step 1: Broadcasts, Committees, Events & Attendance, Violations
		await db.transaction(async (tx) => {
			await tx
				.insert(broadcasts)
				.values([
					{
						id: SEED_IDS.broadcasts[0],
						title: "Hasil Penilaian Triwulan I SR 14 Resmi Difinalisasi",
						content:
							"Halo rekan-rekan Senior Resident. Hasil penilaian kinerja Triwulan I SR 14 telah resmi difinalisasi oleh HCO. Silakan cek Dashboard Personal masing-masing untuk melihat ringkasan skor akhir, rincian komponen, serta mengunduh rekap CSV pribadi.",
						linkUrl: null,
						createdByUserId: devHco.userId,
						publishedAt: hoursAgo(12),
						expiresAt: hoursFromNow(144),
						archivedAt: null,
					},
					{
						id: SEED_IDS.broadcasts[1],
						title: "Persiapan Rapat Kerja Triwulan II & Presensi QR Aktif",
						content:
							"Dimohon seluruh SR hadir tepat waktu pada Rapat Kerja Triwulan II SR 14 di Dorm Hall. Pastikan akun siap melakukan Scan QR check-in di lokasi serta mengisi evaluasi rekan kegiatan setelah rapat berlangsung.",
						linkUrl: null,
						createdByUserId: devHco.userId,
						publishedAt: hoursAgo(6),
						expiresAt: hoursFromNow(156),
						archivedAt: null,
					},
					{
						id: SEED_IDS.broadcasts[2],
						title:
							"Pengingat Pencatatan Pelanggaran Mahasiswa & Kebersihan Asrama",
						content:
							"Pengurus SR harap segera mencatat temuan pelanggaran mahasiswa asrama lengkap dengan foto bukti KTM melalui menu Pelanggaran agar riwayat pembinaan per gedung selalu mutakhir.",
						linkUrl: null,
						createdByUserId: testInti.userId,
						publishedAt: hoursAgo(2),
						expiresAt: hoursFromNow(160),
						archivedAt: null,
					},
				])
				.onConflictDoNothing();

			await tx
				.insert(committees)
				.values([
					{
						id: SEED_IDS.committees.dormFest,
						name: "Dormitory Festival 2026",
						description:
							"Kepanitiaan acara tahunan penyambutan dan festival kreativitas penghuni asrama Telkom.",
						createdByUserId: devHco.userId,
					},
					{
						id: SEED_IDS.committees.careerTalk,
						name: "Program Akademik & Karier Asrama 2026",
						description:
							"Rangkaian seminar akademik, mentoring riset, dan persiapan karier bagi penghuni asrama.",
						createdByUserId: devKadepRnd.userId,
					},
				])
				.onConflictDoNothing();

			await tx
				.insert(committeeDivisions)
				.values([
					{
						id: SEED_IDS.divisions.dfAcara,
						committeeId: SEED_IDS.committees.dormFest,
						name: "Acara",
					},
					{
						id: SEED_IDS.divisions.dfHumas,
						committeeId: SEED_IDS.committees.dormFest,
						name: "Humas",
					},
					{
						id: SEED_IDS.divisions.dfLogistik,
						committeeId: SEED_IDS.committees.dormFest,
						name: "Logistik",
					},
					{
						id: SEED_IDS.divisions.dfDokum,
						committeeId: SEED_IDS.committees.dormFest,
						name: "Dokumentasi",
					},
					{
						id: SEED_IDS.divisions.ctMateri,
						committeeId: SEED_IDS.committees.careerTalk,
						name: "Kurasi Materi",
					},
					{
						id: SEED_IDS.divisions.ctOps,
						committeeId: SEED_IDS.committees.careerTalk,
						name: "Operasional",
					},
					{
						id: SEED_IDS.divisions.ctPublikasi,
						committeeId: SEED_IDS.committees.careerTalk,
						name: "Publikasi",
					},
				])
				.onConflictDoNothing();

			const nonLoadTestSrs = rosterRows.filter(
				(r) => !r.username?.startsWith("lt_resora_") && r.isActive,
			);
			const dfDivs = [
				{ id: SEED_IDS.divisions.dfAcara, name: "Acara" },
				{ id: SEED_IDS.divisions.dfHumas, name: "Humas" },
				{ id: SEED_IDS.divisions.dfLogistik, name: "Logistik" },
				{ id: SEED_IDS.divisions.dfDokum, name: "Dokumentasi" },
			];
			const ctDivs = [
				{ id: SEED_IDS.divisions.ctMateri, name: "Kurasi Materi" },
				{ id: SEED_IDS.divisions.ctOps, name: "Operasional" },
				{ id: SEED_IDS.divisions.ctPublikasi, name: "Publikasi" },
			];

			const dfMemberMap = new Map<
				string,
				{
					divisionName: string;
					positionCode: "PIC1" | "PIC2" | "KADEP" | "SEKRE" | "ANGGOTA";
				}
			>();
			const committeeMemberRows: Array<{
				committeeId: string;
				userId: string;
				divisionId: string;
				positionCode:
					| "PIC1"
					| "PIC2"
					| "KADEP"
					| "SEKDEP"
					| "SEKRE"
					| "BENDAHARA"
					| "ANGGOTA";
			}> = [];

			nonLoadTestSrs.forEach((member, idx) => {
				const dfDiv = dfDivs[idx % dfDivs.length];
				if (dfDiv) {
					const dfPos: "PIC1" | "PIC2" | "KADEP" | "SEKRE" | "ANGGOTA" =
						member.userId === devHco.userId
							? "PIC1"
							: member.userId === devKadepRnd.userId
								? "KADEP"
								: member.positionCode === "SEKDEP"
									? "SEKRE"
									: "ANGGOTA";
					committeeMemberRows.push({
						committeeId: SEED_IDS.committees.dormFest,
						userId: member.userId,
						divisionId: dfDiv.id,
						positionCode: dfPos,
					});
					dfMemberMap.set(member.userId, {
						divisionName: dfDiv.name,
						positionCode: dfPos,
					});
				}
				if (
					idx % 2 === 0 ||
					member.userId === devAnggota.userId ||
					member.userId === devHco.userId
				) {
					const ctDiv = ctDivs[idx % ctDivs.length];
					if (ctDiv) {
						committeeMemberRows.push({
							committeeId: SEED_IDS.committees.careerTalk,
							userId: member.userId,
							divisionId: ctDiv.id,
							positionCode:
								member.userId === devKadepRnd.userId
									? "PIC1"
									: member.userId === devAnggota.userId
										? "SEKRE"
										: "ANGGOTA",
						});
					}
				}
			});

			if (committeeMemberRows.length > 0) {
				await tx
					.insert(committeeMembers)
					.values(committeeMemberRows)
					.onConflictDoNothing();
			}

			// Events + Sessions (atomic in same transaction because of deferred trigger)
			const eventSpecs = [
				{
					id: SEED_IDS.events.annualFest,
					sessionId: SEED_IDS.sessions.annualFest,
					title: "Dormitory Festival & Gathering Asrama 2026",
					description:
						"Kegiatan tahunan akbar seluruh penghuni asrama dan Senior Resident di Dorm Hall.",
					status: "CLOSED" as const,
					visibility: "VISIBLE" as const,
					scoringMode: "INCLUDED" as const,
					organizationContext: "COMMITTEE" as const,
					committeeId: SEED_IDS.committees.dormFest,
					snapshotCommitteeName: "Dormitory Festival 2026",
					startsAt: new Date("2026-09-12T01:00:00.000Z"),
					endsAt: new Date("2026-09-12T06:00:00.000Z"),
					publishedAt: new Date("2026-09-05T04:00:00.000Z"),
					closedAt: new Date("2026-09-12T06:30:00.000Z"),
					sessionStatus: "CLOSED" as const,
					activatedAt: new Date("2026-09-12T00:45:00.000Z"),
					sessionClosedAt: new Date("2026-09-12T06:30:00.000Z"),
				},
				{
					id: SEED_IDS.events.monthlyOct,
					sessionId: SEED_IDS.sessions.monthlyOct,
					title: "Rapat Koordinasi Bulanan Oktober SR 14",
					description:
						"Sinkronisasi program departemen dan evaluasi kedisiplinan penghuni bulan Oktober.",
					status: "CLOSED" as const,
					visibility: "VISIBLE" as const,
					scoringMode: "INCLUDED" as const,
					organizationContext: "SR" as const,
					committeeId: null,
					snapshotCommitteeName: null,
					startsAt: new Date("2026-10-18T12:00:00.000Z"),
					endsAt: new Date("2026-10-18T14:00:00.000Z"),
					publishedAt: new Date("2026-10-10T03:00:00.000Z"),
					closedAt: new Date("2026-10-18T14:15:00.000Z"),
					sessionStatus: "CLOSED" as const,
					activatedAt: new Date("2026-10-18T11:45:00.000Z"),
					sessionClosedAt: new Date("2026-10-18T14:15:00.000Z"),
				},
				{
					id: SEED_IDS.events.weeklyNov,
					sessionId: SEED_IDS.sessions.weeklyNov,
					title: "Evaluasi Mingguan Pembinaan Gedung SR 14",
					description:
						"Pertemuan rutin mingguan monitoring ketertiban gedung putra dan putri.",
					status: "CLOSED" as const,
					visibility: "VISIBLE" as const,
					scoringMode: "INCLUDED" as const,
					organizationContext: "SR" as const,
					committeeId: null,
					snapshotCommitteeName: null,
					startsAt: new Date("2026-11-12T12:30:00.000Z"),
					endsAt: new Date("2026-11-12T14:00:00.000Z"),
					publishedAt: new Date("2026-11-08T04:00:00.000Z"),
					closedAt: new Date("2026-11-12T14:15:00.000Z"),
					sessionStatus: "CLOSED" as const,
					activatedAt: new Date("2026-11-12T12:15:00.000Z"),
					sessionClosedAt: new Date("2026-11-12T14:15:00.000Z"),
				},
				{
					id: SEED_IDS.events.upcomingRaker,
					sessionId: SEED_IDS.sessions.upcomingRaker,
					title: "Rapat Kerja Triwulan II SR 14",
					description:
						"Perencanaan program kerja Triwulan II serta pengaktifan QR check-in uji coba langsung.",
					status: "PUBLISHED" as const,
					visibility: "VISIBLE" as const,
					scoringMode: "INCLUDED" as const,
					organizationContext: "SR" as const,
					committeeId: null,
					snapshotCommitteeName: null,
					startsAt: daysFromNow(4, 12),
					endsAt: daysFromNow(4, 14),
					publishedAt: hoursAgo(24),
					closedAt: null,
					sessionStatus: "ACTIVE" as const,
					activatedAt: hoursAgo(1),
					sessionClosedAt: null,
				},
				{
					id: SEED_IDS.events.upcomingCareer,
					sessionId: SEED_IDS.sessions.upcomingCareer,
					title: "Seminar Karier & Akademik Asrama 2026",
					description:
						"Seminar terbuka mahasiswa asrama bersama pembicara alumni dan panitia Akademik/RnD.",
					status: "PUBLISHED" as const,
					visibility: "VISIBLE" as const,
					scoringMode: "INCLUDED" as const,
					organizationContext: "COMMITTEE" as const,
					committeeId: SEED_IDS.committees.careerTalk,
					snapshotCommitteeName: "Program Akademik & Karier Asrama 2026",
					startsAt: daysFromNow(12, 2),
					endsAt: daysFromNow(12, 6),
					publishedAt: hoursAgo(18),
					closedAt: null,
					sessionStatus: "INACTIVE" as const,
					activatedAt: null,
					sessionClosedAt: null,
				},
				{
					id: SEED_IDS.events.draftMubes,
					sessionId: SEED_IDS.sessions.draftMubes,
					title: "Musyawarah Tengah Tahun Kepengurusan SR 14",
					description:
						"Draft agenda evaluasi tengah tahun untuk seluruh jajaran kepengurusan SR 14.",
					status: "DRAFT" as const,
					visibility: "VISIBLE" as const,
					scoringMode: "INCLUDED" as const,
					organizationContext: "SR" as const,
					committeeId: null,
					snapshotCommitteeName: null,
					startsAt: daysFromNow(28, 3),
					endsAt: daysFromNow(28, 7),
					publishedAt: null,
					closedAt: null,
					sessionStatus: "INACTIVE" as const,
					activatedAt: null,
					sessionClosedAt: null,
				},
			];

			for (const spec of eventSpecs) {
				await tx
					.insert(events)
					.values({
						id: spec.id,
						title: spec.title,
						description: spec.description,
						createdByUserId: devHco.userId,
						status: spec.status,
						visibility: spec.visibility,
						attendanceScoringMode: spec.scoringMode,
						startsAt: spec.startsAt,
						endsAt: spec.endsAt,
						rosterCriteria: {
							allSr: true,
							inti: false,
							departments: [],
							kadep: false,
							individuals: [],
							include: [],
							exclude: [],
						},
						organizationContext: spec.organizationContext,
						committeeId: spec.committeeId,
						snapshotCommitteeName: spec.snapshotCommitteeName,
						publishedAt: spec.publishedAt,
						closedAt: spec.closedAt,
					})
					.onConflictDoNothing();

				await tx
					.insert(attendanceSessions)
					.values({
						id: spec.sessionId,
						internalEventId: spec.id,
						status: spec.sessionStatus,
						centerLat: -6.9712891,
						centerLng: 107.628339,
						geofenceRadiusM: 50,
						lateGraceMinutes: 15,
						qrTtlMinutes: 360,
						activatedAt: spec.activatedAt,
						closedAt: spec.sessionClosedAt,
					})
					.onConflictDoNothing();
			}

			await tx
				.insert(qrChallenges)
				.values({
					id: "d0000000-0000-4000-8000-000000000399",
					sessionId: SEED_IDS.sessions.upcomingRaker,
					activatedAt: hoursAgo(1),
					expiresAt: hoursFromNow(5),
					revokedAt: null,
					isCurrent: true,
					issuedByUserId: devHco.userId,
				})
				.onConflictDoNothing();

			const publishedEventIds = [
				{
					id: SEED_IDS.events.annualFest,
					sessionId: SEED_IDS.sessions.annualFest,
					startsAt: new Date("2026-09-12T01:00:00.000Z"),
					isCommittee: true,
					closed: true,
				},
				{
					id: SEED_IDS.events.monthlyOct,
					sessionId: SEED_IDS.sessions.monthlyOct,
					startsAt: new Date("2026-10-18T12:00:00.000Z"),
					isCommittee: false,
					closed: true,
				},
				{
					id: SEED_IDS.events.weeklyNov,
					sessionId: SEED_IDS.sessions.weeklyNov,
					startsAt: new Date("2026-11-12T12:30:00.000Z"),
					isCommittee: false,
					closed: true,
				},
				{
					id: SEED_IDS.events.upcomingRaker,
					sessionId: SEED_IDS.sessions.upcomingRaker,
					startsAt: daysFromNow(4, 12),
					isCommittee: false,
					closed: false,
				},
				{
					id: SEED_IDS.events.upcomingCareer,
					sessionId: SEED_IDS.sessions.upcomingCareer,
					startsAt: daysFromNow(12, 2),
					isCommittee: true,
					closed: false,
				},
			];

			for (const [evIdx, ev] of publishedEventIds.entries()) {
				const participantRows = rosterRows.map((member) => {
					const cm = ev.isCommittee
						? dfMemberMap.get(member.userId)
						: undefined;
					return {
						eventId: ev.id,
						userId: member.userId,
						nim: member.username ?? member.userId,
						name: member.name,
						departmentCode: member.departmentCode,
						positionCode: member.positionCode,
						buildingCode: member.buildingCode,
						buildingName: member.buildingName,
						committeeDivision: cm ? cm.divisionName : null,
						committeePosition: cm ? cm.positionCode : null,
					};
				});
				await tx
					.insert(eventParticipants)
					.values(participantRows)
					.onConflictDoNothing();

				if (ev.closed) {
					const attendanceRows: Array<{
						sessionId: string;
						userId: string;
						attendanceAt: Date;
						source: "QR" | "MANUAL";
						timingClass: "EARLY" | "ON_TIME" | "LATE";
						recordedByUserId: string;
						manualReason: string | null;
						scanLat: number | null;
						scanLng: number | null;
						gpsAccuracyM: number | null;
					}> = [];

					rosterRows.forEach((member, idx) => {
						const bucket = (idx + evIdx * 2) % 10;
						if (bucket === 9) {
							return; // ~10% absent
						}
						if (bucket === 8) {
							attendanceRows.push({
								sessionId: ev.sessionId,
								userId: member.userId,
								attendanceAt: new Date(ev.startsAt.getTime() + 22 * 60_000),
								source: "MANUAL",
								timingClass: "LATE",
								recordedByUserId: devHco.userId,
								manualReason: "Hadir terlambat karena jadwal perkuliahan",
								scanLat: null,
								scanLng: null,
								gpsAccuracyM: null,
							});
							return;
						}
						const isEarly = bucket <= 2;
						const offsetMinutes = isEarly ? -5 : 4;
						attendanceRows.push({
							sessionId: ev.sessionId,
							userId: member.userId,
							attendanceAt: new Date(
								ev.startsAt.getTime() + offsetMinutes * 60_000,
							),
							source: "QR",
							timingClass: isEarly ? "EARLY" : "ON_TIME",
							recordedByUserId: member.userId,
							manualReason: null,
							scanLat: -6.9712891,
							scanLng: 107.628339,
							gpsAccuracyM: 12.4,
						});
					});

					if (attendanceRows.length > 0) {
						await tx
							.insert(attendanceRecords)
							.values(attendanceRows)
							.onConflictDoNothing();
					}
				}
			}

			// Violations dummy student records
			const violationReporters = [
				devAnggota.userId,
				devKadepRnd.userId,
				devHco.userId,
				testInti.userId,
			];
			const violationDescriptions = [
				"Keterlambatan jam malam gerbang asrama melebihi pukul 22.00 WIB tanpa surat izin.",
				"Membawa peralatan pemanas listrik berdaya tinggi di luar daftar izin kamar.",
				"Kebisingan di area koridor lantai 3 setelah pukul 23.30 WIB.",
				"Tidak mengikuti piket kebersihan koridor mingguan tanpa keterangan.",
				"Menaruh barang pribadi dan jemuran di area jalur evakuasi tangga darurat.",
				"Menerima tamu non-penghuni masuk ke area blok kamar tanpa melapor ke SR jaga.",
				"Keterlambatan pengembalian kunci ruang belajar bersama.",
				"Parkir kendaraan bermotor di area selasar pejalan kaki gedung asrama.",
			];

			for (let i = 1; i <= 8; i++) {
				const bld = allBuildings[(i - 1) % allBuildings.length];
				const reporterUserId =
					violationReporters[(i - 1) % violationReporters.length] ??
					devHco.userId;
				if (!bld) continue;
				const reportId = uuidFromIndex("d0000000-0000-4000-8000", 500 + i);
				const publicCode = `PLG-26DEV0000${i}`;
				const existingReport = await db.$client.query<{ id: string }>(
					"SELECT id FROM violations_reports WHERE public_code = $1 LIMIT 1",
					[publicCode],
				);
				if (existingReport.rows.length === 0) {
					const studentName = `Mahasiswa Demo 0${i}`;
					const studentNim = `110126010${i}`;
					const incidentDate = `2026-11-${String(10 + i).padStart(2, "0")}`;
					const description =
						violationDescriptions[i - 1] ?? "Pelanggaran tata tertib asrama.";
					const ktmObjectKey = `dev-seed/ktm-demo-0${i}.jpg`;

					await tx.insert(violationsReports).values({
						id: reportId,
						publicCode,
						studentName,
						studentNim,
						incidentDate,
						description,
						reporterUserId,
						recordedBuildingId: bld.id,
						recordedBuildingName: bld.name,
						ktmObjectKey,
						ktmContentType: "image/jpeg",
						ktmSizeBytes: 145_000 + i * 1024,
						idempotencyKey: uuidFromIndex("d0000000-0000-4000-8000", 600 + i),
						version: 1,
					});

					await tx.insert(violationsAudits).values({
						id: uuidFromIndex("d0000000-0000-4000-8000", 700 + i),
						reportId,
						actorUserId: reporterUserId,
						action: "CREATED",
						reason: null,
						beforeState: null,
						afterState: {
							publicCode,
							studentName,
							studentNim,
							incidentDate,
							recordedBuildingName: bld.name,
						},
					});
				}
			}
		});

		// Step 2: Evaluation Period 1 (seeded OPEN, populated for 100% roster, then finalized via appRouter)
		const p1Id = SEED_IDS.evalPeriods.triwulan1Final;
		const existingP1Res = await db.$client.query<{
			id: string;
			status: string;
		}>("SELECT id, status FROM evaluation_periods WHERE id = $1 LIMIT 1", [
			p1Id,
		]);
		const existingP1 = existingP1Res.rows[0];

		const defaultSchedules = {
			annualEvent: {
				startsOn: "2026-09-01",
				endsOn: "2026-11-25",
				cadenceNote: "Evaluasi setiap 3 bulan",
			},
			monthlyEvent: {
				startsOn: "2026-10-15",
				endsOn: "2026-11-25",
				cadenceNote: "Evaluasi setiap 3 bulan",
			},
			weeklyEvent: {
				startsOn: "2026-11-01",
				endsOn: "2026-11-25",
				cadenceNote: "Evaluasi setiap 2 minggu",
			},
			department: {
				startsOn: "2026-11-01",
				endsOn: "2026-11-25",
				cadenceNote: "Evaluasi setiap 3 bulan",
			},
			gform: {
				startsOn: "2026-11-01",
				endsOn: "2026-11-25",
				cadenceNote: "Evaluasi setiap 3 bulan",
			},
			external: {
				startsOn: null,
				endsOn: null,
				cadenceNote: "Evaluasi eksternal ASUS/Ditmawa Triwulan I",
			},
		};

		if (existingP1?.status !== "FINAL") {
			await db.transaction(async (tx) => {
				if (!existingP1) {
					await tx
						.insert(evaluationPeriods)
						.values({
							id: p1Id,
							srPeriodId: activeSrPeriod.id,
							name: "Evaluasi Triwulan I SR 14 (Final)",
							status: "OPEN",
							version: 1,
							isActive: true,
							schedules: defaultSchedules,
							sidakMaxPoints: 10,
							performanceThreshold: 115,
							createdByUserId: devHco.userId,
						})
						.onConflictDoNothing();

					await tx.insert(evaluationAudits).values({
						evaluationPeriodId: p1Id,
						entityType: "PERIOD",
						entityId: p1Id,
						actorUserId: devHco.userId,
						action: "PERIOD_CREATED",
						reason: "Inisiasi data seeder evaluasi Triwulan I SR 14",
						beforeState: null,
						afterState: {
							name: "Evaluasi Triwulan I SR 14 (Final)",
							status: "OPEN",
						},
					});
				}

				await tx
					.insert(evaluationPeriodEvents)
					.values([
						{
							id: SEED_IDS.evalPeriodEvents.p1Annual,
							evaluationPeriodId: p1Id,
							eventId: SEED_IDS.events.annualFest,
							category: "ANNUAL",
							isMandatory: true,
							configuredByUserId: devHco.userId,
						},
						{
							id: SEED_IDS.evalPeriodEvents.p1Monthly,
							evaluationPeriodId: p1Id,
							eventId: SEED_IDS.events.monthlyOct,
							category: "MONTHLY",
							isMandatory: true,
							configuredByUserId: devHco.userId,
						},
						{
							id: SEED_IDS.evalPeriodEvents.p1Weekly,
							evaluationPeriodId: p1Id,
							eventId: SEED_IDS.events.weeklyNov,
							category: "WEEKLY",
							isMandatory: true,
							configuredByUserId: devHco.userId,
						},
					])
					.onConflictDoNothing();

				const p1EventIds = [
					SEED_IDS.evalPeriodEvents.p1Annual,
					SEED_IDS.evalPeriodEvents.p1Monthly,
					SEED_IDS.evalPeriodEvents.p1Weekly,
				];
				const commentsPool = [
					"Koordinasi lintas divisi sangat responsif dan konsisten.",
					"Inisiatif baik saat penanganan teknis di lapangan.",
					"Kehadiran dan komunikasi tim terjaga dengan baik.",
					null,
					null,
				];

				const eventScoreValues: Array<
					typeof evaluationEventScores.$inferInsert
				> = [];
				for (const [peIdx, peId] of p1EventIds.entries()) {
					rosterRows.forEach((target, tIdx) => {
						rosterRows.forEach((evaluator, eIdx) => {
							if (evaluator.userId === target.userId) return;
							const seed = tIdx * 17 + peIdx * 11 + eIdx * 5;
							eventScoreValues.push({
								evaluationPeriodId: p1Id,
								periodEventId: peId,
								evaluatorUserId: evaluator.userId,
								targetUserId: target.userId,
								commitment: deterministicScore(seed, 78, 96),
								teamwork: deterministicScore(seed + 1, 76, 97),
								attitude: deterministicScore(seed + 2, 80, 98),
								contribution: deterministicScore(seed + 3, 75, 96),
								comment:
									eIdx < 3
										? (commentsPool[seed % commentsPool.length] ?? null)
										: null,
							});
						});
					});
				}
				for (let offset = 0; offset < eventScoreValues.length; offset += 500) {
					const chunk = eventScoreValues.slice(offset, offset + 500);
					await tx
						.insert(evaluationEventScores)
						.values(chunk)
						.onConflictDoNothing();
				}

				// Department scores obeying D03 strictly
				const deptScoreValues: Array<
					typeof evaluationDepartmentScores.$inferInsert
				> = [];
				rosterRows.forEach((target, idx) => {
					let evaluatorUserId: string;
					if (target.departmentCode === "INTI") {
						evaluatorUserId =
							target.userId === testInti.userId
								? altInti.userId
								: testInti.userId;
					} else if (target.positionCode === "KADEP") {
						evaluatorUserId = testInti.userId;
					} else if (target.departmentCode === "HCO") {
						evaluatorUserId = devHco.userId;
					} else {
						evaluatorUserId =
							kadepByDept.get(target.departmentCode)?.userId ?? devHco.userId;
					}
					if (evaluatorUserId === target.userId) {
						evaluatorUserId =
							evaluatorUserId === testInti.userId
								? altInti.userId
								: testInti.userId;
					}
					const seed = idx * 23 + 7;
					deptScoreValues.push({
						evaluationPeriodId: p1Id,
						quarterNumber: 1,
						evaluatorUserId,
						targetUserId: target.userId,
						targetDepartmentCode: target.departmentCode,
						targetPositionCode: target.positionCode,
						commitment: deterministicScore(seed, 80, 97),
						teamwork: deterministicScore(seed + 1, 78, 96),
						attitude: deterministicScore(seed + 2, 82, 98),
						contribution: deterministicScore(seed + 3, 77, 97),
						comment:
							idx % 3 === 0
								? "Menunjukkan performa stabil dalam tugas departemen."
								: null,
					});
				});
				await tx
					.insert(evaluationDepartmentScores)
					.values(deptScoreValues)
					.onConflictDoNothing();

				// GForm responses (SR_MABA 20q + EXTERNAL_ASUS_DITMAWA 10q)
				const gformValues: Array<typeof evaluationGformResponses.$inferInsert> =
					[];
				rosterRows.forEach((target, idx) => {
					for (let resp = 1; resp <= 2; resp++) {
						const seed = idx * 13 + resp * 7;
						const answers = buildTwentyAnswers(
							4.1 + ((idx + resp) % 3) * 0.2,
							seed,
						);
						const totalScore = answers.reduce((a, b) => a + b, 0);
						gformValues.push({
							evaluationPeriodId: p1Id,
							sourceType: "SR_MABA",
							cycleNumber: 1,
							sourceReference: "seed-gform-sr-maba-triwulan1.csv",
							respondentKey: `maba-bld-${target.buildingCode}-${String(idx + 1).padStart(3, "0")}-r${resp}`,
							respondentRole: resp === 1 ? "MABA" : "SR_SE_GEDUNG",
							targetUserId: target.userId,
							buildingCode: target.buildingCode,
							answers,
							totalScore,
							comment:
								resp === 1 && idx % 4 === 0
									? "Kakak SR ramah dan responsif membantu adaptasi penghuni gedung."
									: null,
							importedByUserId: devHco.userId,
						});
					}
					const extSeed = idx * 19 + 3;
					const extAnswers = buildTenAnswers(4.3 + (idx % 2) * 0.2, extSeed);
					const extTotal = extAnswers.reduce((a, b) => a + b, 0);
					gformValues.push({
						evaluationPeriodId: p1Id,
						sourceType: "EXTERNAL_ASUS_DITMAWA",
						cycleNumber: 1,
						sourceReference: "seed-gform-eksternal-asus-ditmawa.csv",
						respondentKey: `ext-${idx % 2 === 0 ? "asus" : "ditmawa"}-${String(idx + 1).padStart(3, "0")}`,
						respondentRole: idx % 2 === 0 ? "ASUS" : "DITMAWA",
						targetUserId: target.userId,
						buildingCode: target.buildingCode,
						answers: extAnswers,
						totalScore: extTotal,
						comment:
							idx % 5 === 0
								? "Koordinasi pengawasan gedung bersama pihak eksternal berjalan lancar."
								: null,
						importedByUserId: devHco.userId,
					});
				});
				await tx
					.insert(evaluationGformResponses)
					.values(gformValues)
					.onConflictDoNothing();

				// Attendance fallbacks & approved point transactions in Period 1
				const keyTargets = rosterRows
					.filter((r) => !r.username?.startsWith("lt_resora_") && r.isActive)
					.slice(0, 20);
				await tx
					.insert(evaluationAttendanceFallbacks)
					.values(
						keyTargets.map((target, idx) => ({
							evaluationPeriodId: p1Id,
							targetUserId: target.userId,
							activityType:
								idx % 2 === 0
									? ("SIDAK" as const)
									: ("RAPAT_ALL_PANITIA" as const),
							activityTitle:
								idx % 2 === 0
									? "Sidak Ketertiban Malam Gedung SR 14"
									: "Rapat Pleno Awal Kepengurusan SR 14",
							activityDate: idx % 2 === 0 ? "2026-10-25" : "2026-08-20",
							attendanceStatus:
								idx % 5 === 0
									? ("TERLAMBAT_DENGAN_IZIN" as const)
									: ("HADIR_TEPAT_WAKTU" as const),
							maxPoints: 10,
							earnedPoints: idx % 5 === 0 ? 8 : 10,
							sourceKind: "MANUAL_FALLBACK" as const,
							sourceReference: "seed-fallback-triwulan1",
							notes: "Rekam fallback resmi HCO untuk kegiatan luar modul QR",
							recordedByUserId: devHco.userId,
						})),
					)
					.onConflictDoNothing();

				const p1Transactions: Array<
					typeof evaluationPointTransactions.$inferInsert
				> = keyTargets.slice(0, 14).map((target, idx) => ({
					id: uuidFromIndex("d0000000-0000-4000-8000", 800 + idx),
					evaluationPeriodId: p1Id,
					targetUserId: target.userId,
					transactionType: idx % 6 === 5 ? "DEDUCTION" : "ADDITION",
					points: idx % 6 === 5 ? 3 : 5 + (idx % 3) * 2,
					category:
						idx % 6 === 5 ? "Keterlambatan Laporan" : "Inisiatif & Kontribusi",
					reason:
						idx % 6 === 5
							? "Keterlambatan pengumpulan laporan mingguan gedung"
							: "Kontribusi aktif koordinasi program pembinaan mahasiswa",
					occurredOn: "2026-11-05",
					status: "APPROVED",
					proposedByUserId: devKadepRnd.userId,
					decidedByUserId: idx % 2 === 0 ? devHco.userId : testInti.userId,
					decisionNote: "Disetujui sesuai rekap kinerja Triwulan I",
					decidedAt: hoursAgo(48),
				}));
				await tx
					.insert(evaluationPointTransactions)
					.values(p1Transactions)
					.onConflictDoNothing();
			});
		}

		// Finalize Period 1 through the real application router if still OPEN
		const checkP1Res = await db.$client.query<{ status: string }>(
			"SELECT status FROM evaluation_periods WHERE id = $1 LIMIT 1",
			[p1Id],
		);
		const checkP1 = checkP1Res.rows[0];

		if (checkP1?.status !== "FINAL") {
			const caller = appRouter.createCaller({
				db,
				session: {
					user: {
						id: devHco.userId,
						name: devHco.name,
						email: `${devHco.username}@resora.local`,
					},
					session: {
						id: "seed-finalization-session",
						userId: devHco.userId,
						expiresAt: hoursFromNow(1),
					},
				} as never,
			});
			await caller.penilaian.finalizePeriod({
				evaluationPeriodId: p1Id,
				reason: "Finalisasi otomatis data seeder development Triwulan I SR 14",
			});
		}

		// Step 3: Evaluation Period 2 (OPEN) for interactive testing of input/approval workflows
		const p2Id = SEED_IDS.evalPeriods.triwulan2Open;
		const existingP2Res = await db.$client.query<{ id: string }>(
			"SELECT id FROM evaluation_periods WHERE id = $1 LIMIT 1",
			[p2Id],
		);
		const existingP2 = existingP2Res.rows[0];

		if (!existingP2) {
			await db.transaction(async (tx) => {
				await tx
					.insert(evaluationPeriods)
					.values({
						id: p2Id,
						srPeriodId: activeSrPeriod.id,
						name: "Evaluasi Triwulan II SR 14 (Berjalan)",
						status: "OPEN",
						version: 1,
						isActive: false,
						schedules: defaultSchedules,
						sidakMaxPoints: 10,
						performanceThreshold: null,
						createdByUserId: devHco.userId,
					})
					.onConflictDoNothing();

				await tx.insert(evaluationAudits).values({
					evaluationPeriodId: p2Id,
					entityType: "PERIOD",
					entityId: p2Id,
					actorUserId: devHco.userId,
					action: "PERIOD_CREATED",
					reason:
						"Inisiasi periode evaluasi berjalan Triwulan II (data uji interaktif)",
					beforeState: null,
					afterState: {
						name: "Evaluasi Triwulan II SR 14 (Berjalan)",
						status: "OPEN",
					},
				});

				await tx
					.insert(evaluationPeriodEvents)
					.values({
						id: SEED_IDS.evalPeriodEvents.p2Raker,
						evaluationPeriodId: p2Id,
						eventId: SEED_IDS.events.upcomingRaker,
						category: "MONTHLY",
						isMandatory: true,
						configuredByUserId: devHco.userId,
					})
					.onConflictDoNothing();

				// Sample pending & decided point transactions for HCO/INTI moderation queue
				const p2Targets = rosterRows.filter(
					(r) => !r.username?.startsWith("lt_resora_") && r.isActive,
				);
				const t1 =
					p2Targets.find((r) => r.userId === devAnggota.userId) ?? p2Targets[0];
				const t2 =
					p2Targets.find((r) => r.userId === devKadepRnd.userId) ??
					p2Targets[1];
				const t3 =
					p2Targets.find((r) => r.userId === devHco.userId) ?? p2Targets[2];
				if (t1 && t2 && t3) {
					await tx
						.insert(evaluationPointTransactions)
						.values([
							{
								id: uuidFromIndex("d0000000-0000-4000-8000", 851),
								evaluationPeriodId: p2Id,
								targetUserId: t1.userId,
								transactionType: "ADDITION",
								points: 5,
								category: "Inisiatif Program",
								reason: "Menyusun modul orientasi digital penghuni baru",
								occurredOn: "2026-11-26",
								status: "PENDING",
								proposedByUserId: devKadepRnd.userId,
								decidedByUserId: null,
								decisionNote: null,
								decidedAt: null,
							},
							{
								id: uuidFromIndex("d0000000-0000-4000-8000", 852),
								evaluationPeriodId: p2Id,
								targetUserId: t2.userId,
								transactionType: "DEDUCTION",
								points: 2,
								category: "Keterlambatan Agenda",
								reason: "Terlambat menyerahkan draft jadwal riset departemen",
								occurredOn: "2026-11-27",
								status: "PENDING",
								proposedByUserId: devHco.userId,
								decidedByUserId: null,
								decisionNote: null,
								decidedAt: null,
							},
							{
								id: uuidFromIndex("d0000000-0000-4000-8000", 853),
								evaluationPeriodId: p2Id,
								targetUserId: t3.userId,
								transactionType: "ADDITION",
								points: 8,
								category: "Koordinator Kegiatan",
								reason:
									"Penanggung jawab sinkronisasi instrumen evaluasi Triwulan II",
								occurredOn: "2026-11-25",
								status: "APPROVED",
								proposedByUserId: testInti.userId,
								decidedByUserId: devHco.userId,
								decisionNote: "Terverifikasi",
								decidedAt: hoursAgo(12),
							},
						])
						.onConflictDoNothing();
				}

				// Partial sample event score & fallback so pre-final analytics work on Period 2
				if (t1 && t2) {
					await tx
						.insert(evaluationEventScores)
						.values({
							evaluationPeriodId: p2Id,
							periodEventId: SEED_IDS.evalPeriodEvents.p2Raker,
							evaluatorUserId: testInti.userId,
							targetUserId: t1.userId,
							commitment: 88,
							teamwork: 90,
							attitude: 92,
							contribution: 87,
							comment: "Persiapan materi rapat kerja sudah rapi.",
						})
						.onConflictDoNothing();

					await tx
						.insert(evaluationAttendanceFallbacks)
						.values({
							evaluationPeriodId: p2Id,
							targetUserId: t2.userId,
							activityType: "SIDAK",
							activityTitle: "Sidak Awal Triwulan II Gedung Putra",
							activityDate: "2026-11-24",
							attendanceStatus: "HADIR_TEPAT_WAKTU",
							maxPoints: 10,
							earnedPoints: 10,
							sourceKind: "MANUAL_FALLBACK",
							sourceReference: "seed-fallback-triwulan2",
							notes: "Pelaksanaan sidak gedung awal Triwulan II",
							recordedByUserId: devHco.userId,
						})
						.onConflictDoNothing();
				}
			});
		}

		// Step 4: Dorm Team (DT) accounts, memberships, building assignments, committee links, and DT events
		const devAdaptif =
			pickUser("kadep.adaptif") ??
			pickUser("sekdep.adaptif") ??
			pickUser("anggota.adaptif") ??
			rosterRows.find(
				(r) => r.departmentCode === "ADAPTIF" && r.isActive,
			) ??
			devHco;

		const bldA = allBuildings[0];
		const bldB = allBuildings[1] ?? bldA;
		const bldC = allBuildings[2] ?? bldA;
		if (!bldA || !bldB || !bldC) {
			throw new Error("BUILDINGS_MISSING_FOR_DT_SEED");
		}

		const dtFixtures = [
			{
				key: "activeA" as const,
				membershipId: SEED_IDS.dtMemberships.activeA,
				assignmentId: SEED_IDS.dtAssignments.activeA,
				nim: "1301269001",
				name: "Rafi Dorm Team",
				email: "1301269001@dt.resora.local",
				status: "ACTIVE" as const,
				startsOn: "2026-08-01",
				endsOn: "2027-07-31",
				building: bldA,
				workProgram: "Piket Malam & Pendampingan Kebersihan Blok",
				registrationNotes: "Anggota DT aktif gedung utama",
			},
			{
				key: "activeB" as const,
				membershipId: SEED_IDS.dtMemberships.activeB,
				assignmentId: SEED_IDS.dtAssignments.activeB,
				nim: "1301269002",
				name: "Sinta Dorm Team",
				email: "1301269002@dt.resora.local",
				status: "ACTIVE" as const,
				startsOn: "2026-08-01",
				endsOn: "2027-07-31",
				building: bldB,
				workProgram: "Logistik Harian & Monitoring Gerbang Gedung",
				registrationNotes: "Anggota DT aktif dukungan logistik",
			},
			{
				key: "candidateC" as const,
				membershipId: SEED_IDS.dtMemberships.candidateC,
				assignmentId: null,
				nim: "1301269003",
				name: "Dimas Calon DT",
				email: "1301269003@dt.resora.local",
				status: "CANDIDATE" as const,
				startsOn: null,
				endsOn: null,
				building: bldC,
				workProgram: "Pendampingan Lantai Dasar",
				registrationNotes: "Calon DT menunggu tinjauan Departemen Adaptif",
			},
		];

		const existingDtUsersRes = await db.$client.query<{
			id: string;
			username: string;
		}>(
			`SELECT id, username FROM "user" WHERE username = ANY($1::text[])`,
			[dtFixtures.map((f) => f.nim)],
		);
		const userIdByNim = new Map<string, string>();
		for (const row of existingDtUsersRes.rows) {
			if (row.username) userIdByNim.set(row.username, row.id);
		}
		const existingDtMembershipRes = await db.$client.query<{
			user_id: string;
		}>(
			"SELECT user_id FROM dt_memberships WHERE user_id = ANY($1::text[])",
			[[...userIdByNim.values()]],
		);
		const usersWithDtMembership = new Set(
			existingDtMembershipRes.rows.map((r) => r.user_id),
		);

		await db.transaction(async (tx) => {
			const ctx = await createAuth(ENV, tx).$context;
			const seedDtPassword =
				process.env.SEED_DT_PASSWORD ?? randomBytes(15).toString("base64url");
			const dtPasswordHash = await ctx.password.hash(seedDtPassword);

			for (const fixture of dtFixtures) {
				let userId = userIdByNim.get(fixture.nim);
				if (!userId) {
					const created = await ctx.internalAdapter.createUser(
						{
							name: fixture.name,
							email: fixture.email,
							emailVerified: false,
							username: fixture.nim,
							displayUsername: fixture.nim,
						},
						{ method: "dt-seed" },
					);
					if (!created?.id) {
						throw new Error(`DT_SEED_USER_CREATE_FAILED:${fixture.nim}`);
					}
					await ctx.internalAdapter.linkAccount({
						userId: created.id,
						accountId: created.id,
						providerId: "credential",
						password: dtPasswordHash,
					});
					await tx
						.insert(userProfiles)
						.values({
							userId: created.id,
							actor: "DT",
							isActive: true,
							mustChangePassword: fixture.status === "CANDIDATE",
						})
						.onConflictDoNothing();
					userId = created.id;
					userIdByNim.set(fixture.nim, userId);
				}

				if (!usersWithDtMembership.has(userId)) {
					await tx
						.insert(dtMemberships)
						.values({
							id: fixture.membershipId,
							userId,
							periodName: activeSrPeriod.name,
							status: fixture.status,
							startsOn: fixture.startsOn,
							endsOn: fixture.endsOn,
							departmentCode: null,
							buildingId: fixture.building.id,
							workProgram: fixture.workProgram,
							registrationNotes: fixture.registrationNotes,
							registeredByUserId: devAdaptif.userId,
							reviewedByUserId:
								fixture.status === "ACTIVE" ? devAdaptif.userId : null,
							reviewedAt: fixture.status === "ACTIVE" ? hoursAgo(72) : null,
							decisionReason:
								fixture.status === "ACTIVE"
									? "Aktivasi data seed development DT"
									: null,
						})
						.onConflictDoNothing();

					if (fixture.assignmentId) {
						await tx
							.insert(dtAssignmentHistories)
							.values({
								id: fixture.assignmentId,
								membershipId: fixture.membershipId,
								userId,
								departmentCode: null,
								buildingId: fixture.building.id,
								workProgram: fixture.workProgram,
								reason: "Penugasan awal gedung Dorm Team (seed development)",
								assignedByUserId: devAdaptif.userId,
							})
							.onConflictDoNothing();
					}
				}
			}

			const dtAId = userIdByNim.get("1301269001");
			const dtBId = userIdByNim.get("1301269002");
			const dtCId = userIdByNim.get("1301269003");

			if (dtAId && dtBId && dtCId) {
				await tx
					.insert(dtAudits)
					.values([
						{
							id: SEED_IDS.dtAudits.aReg,
							membershipId: SEED_IDS.dtMemberships.activeA,
							targetUserId: dtAId,
							actorUserId: devAdaptif.userId,
							action: "CANDIDATE_REGISTERED",
							reason: "Pendaftaran awal calon DT (seed development)",
							beforeState: null,
							afterState: {
								status: "CANDIDATE",
								buildingId: bldA.id,
								workProgram: dtFixtures[0]?.workProgram ?? null,
							},
						},
						{
							id: SEED_IDS.dtAudits.aAct,
							membershipId: SEED_IDS.dtMemberships.activeA,
							targetUserId: dtAId,
							actorUserId: devAdaptif.userId,
							action: "MEMBERSHIP_ACTIVATED",
							reason: "Aktivasi DT untuk pengujian development",
							beforeState: { status: "CANDIDATE" },
							afterState: { status: "ACTIVE", buildingId: bldA.id },
						},
						{
							id: SEED_IDS.dtAudits.bReg,
							membershipId: SEED_IDS.dtMemberships.activeB,
							targetUserId: dtBId,
							actorUserId: devAdaptif.userId,
							action: "CANDIDATE_REGISTERED",
							reason: "Pendaftaran awal calon DT (seed development)",
							beforeState: null,
							afterState: {
								status: "CANDIDATE",
								buildingId: bldB.id,
								workProgram: dtFixtures[1]?.workProgram ?? null,
							},
						},
						{
							id: SEED_IDS.dtAudits.bAct,
							membershipId: SEED_IDS.dtMemberships.activeB,
							targetUserId: dtBId,
							actorUserId: devAdaptif.userId,
							action: "MEMBERSHIP_ACTIVATED",
							reason: "Aktivasi DT untuk pengujian development",
							beforeState: { status: "CANDIDATE" },
							afterState: { status: "ACTIVE", buildingId: bldB.id },
						},
						{
							id: SEED_IDS.dtAudits.cReg,
							membershipId: SEED_IDS.dtMemberships.candidateC,
							targetUserId: dtCId,
							actorUserId: devAdaptif.userId,
							action: "CANDIDATE_REGISTERED",
							reason: "Pendaftaran calon DT uji alur review Adaptif",
							beforeState: null,
							afterState: {
								status: "CANDIDATE",
								buildingId: bldC.id,
								workProgram: dtFixtures[2]?.workProgram ?? null,
							},
						},
					])
					.onConflictDoNothing();

				// Link active DT members into committees
				await tx
					.insert(committeeMembers)
					.values([
						{
							committeeId: SEED_IDS.committees.dormFest,
							userId: dtAId,
							divisionId: SEED_IDS.divisions.dfLogistik,
							positionCode: "ANGGOTA",
						},
						{
							committeeId: SEED_IDS.committees.careerTalk,
							userId: dtBId,
							divisionId: SEED_IDS.divisions.ctOps,
							positionCode: "ANGGOTA",
						},
					])
					.onConflictDoNothing();

				// Seed DT-scoped events created by Adaptif (1 CLOSED + 1 PUBLISHED with live QR)
				const dtDoneStart = hoursAgo(74);
				const dtDoneEnd = hoursAgo(72);
				for (const dtEv of [
					{
						id: SEED_IDS.events.dtBriefingDone,
						title: "Briefing Operasional Gedung Dorm Team",
						description:
							"Koordinasi piket malam, kebersihan lantai, dan prosedur laporan DT per gedung.",
						createdByUserId: devAdaptif.userId,
						status: "CLOSED" as const,
						visibility: "VISIBLE" as const,
						attendanceScoringMode: "EXCLUDED" as const,
						startsAt: dtDoneStart,
						endsAt: dtDoneEnd,
						rosterCriteria: {
							allSr: false,
							allDt: true,
							inti: false,
							departments: [],
							kadep: false,
							individuals: [],
							include: [],
							exclude: [],
						},
						organizationContext: "SR" as const,
						committeeId: null,
						snapshotCommitteeName: null,
						publishedAt: hoursAgo(96),
						closedAt: dtDoneEnd,
					},
					{
						id: SEED_IDS.events.dtQrLive,
						title: "Apel Siaga & Absensi QR Dorm Team",
						description:
							"Kegiatan absensi DT kelolaan Departemen Adaptif dengan sesi QR aktif untuk uji check-in.",
						createdByUserId: devAdaptif.userId,
						status: "PUBLISHED" as const,
						visibility: "VISIBLE" as const,
						attendanceScoringMode: "EXCLUDED" as const,
						startsAt: daysFromNow(2, 12),
						endsAt: daysFromNow(2, 14),
						rosterCriteria: {
							allSr: false,
							allDt: true,
							inti: false,
							departments: [],
							kadep: false,
							individuals: [],
							include: [],
							exclude: [],
						},
						organizationContext: "SR" as const,
						committeeId: null,
						snapshotCommitteeName: null,
						publishedAt: hoursAgo(4),
						closedAt: null,
					},
				]) {
					await tx.insert(events).values(dtEv).onConflictDoNothing();
				}

				await tx
					.insert(attendanceSessions)
					.values([
						{
							id: SEED_IDS.sessions.dtBriefingDone,
							internalEventId: SEED_IDS.events.dtBriefingDone,
							status: "CLOSED",
							centerLat: -6.9712891,
							centerLng: 107.628339,
							geofenceRadiusM: 50,
							lateGraceMinutes: 15,
							qrTtlMinutes: 360,
							activatedAt: hoursAgo(74),
							closedAt: dtDoneEnd,
						},
						{
							id: SEED_IDS.sessions.dtQrLive,
							internalEventId: SEED_IDS.events.dtQrLive,
							status: "ACTIVE",
							centerLat: -6.9712891,
							centerLng: 107.628339,
							geofenceRadiusM: 50,
							lateGraceMinutes: 15,
							qrTtlMinutes: 360,
							activatedAt: hoursAgo(1),
							closedAt: null,
						},
					])
					.onConflictDoNothing();

				await tx
					.insert(qrChallenges)
					.values({
						id: "d0000000-0000-4000-8000-000000000398",
						sessionId: SEED_IDS.sessions.dtQrLive,
						activatedAt: hoursAgo(1),
						expiresAt: hoursFromNow(5),
						revokedAt: null,
						isCurrent: true,
						issuedByUserId: devAdaptif.userId,
					})
					.onConflictDoNothing();

				await tx
					.insert(eventParticipants)
					.values([
						{
							eventId: SEED_IDS.events.dtBriefingDone,
							userId: dtAId,
							nim: "1301269001",
							name: "Rafi Dorm Team",
							departmentCode: "DT",
							positionCode: "DT",
							buildingCode: bldA.code,
							buildingName: bldA.name,
							committeeDivision: null,
							committeePosition: null,
						},
						{
							eventId: SEED_IDS.events.dtBriefingDone,
							userId: dtBId,
							nim: "1301269002",
							name: "Sinta Dorm Team",
							departmentCode: "DT",
							positionCode: "DT",
							buildingCode: bldB.code,
							buildingName: bldB.name,
							committeeDivision: null,
							committeePosition: null,
						},
						{
							eventId: SEED_IDS.events.dtQrLive,
							userId: dtAId,
							nim: "1301269001",
							name: "Rafi Dorm Team",
							departmentCode: "DT",
							positionCode: "DT",
							buildingCode: bldA.code,
							buildingName: bldA.name,
							committeeDivision: null,
							committeePosition: null,
						},
						{
							eventId: SEED_IDS.events.dtQrLive,
							userId: dtBId,
							nim: "1301269002",
							name: "Sinta Dorm Team",
							departmentCode: "DT",
							positionCode: "DT",
							buildingCode: bldB.code,
							buildingName: bldB.name,
							committeeDivision: null,
							committeePosition: null,
						},
					])
					.onConflictDoNothing();

				await tx
					.insert(attendanceRecords)
					.values([
						{
							sessionId: SEED_IDS.sessions.dtBriefingDone,
							userId: dtAId,
							attendanceAt: new Date(dtDoneStart.getTime() + 4 * 60_000),
							source: "QR",
							timingClass: "ON_TIME",
							recordedByUserId: dtAId,
							manualReason: null,
							scanLat: -6.9712891,
							scanLng: 107.628339,
							gpsAccuracyM: 10.5,
						},
						{
							sessionId: SEED_IDS.sessions.dtBriefingDone,
							userId: dtBId,
							attendanceAt: new Date(dtDoneStart.getTime() + 20 * 60_000),
							source: "MANUAL",
							timingClass: "LATE",
							recordedByUserId: devAdaptif.userId,
							manualReason: "Terlambat piket pengawasan blok",
							scanLat: null,
							scanLng: null,
							gpsAccuracyM: null,
						},
					])
					.onConflictDoNothing();
			}
		});

		// Summary counts
		const summaryTables = [
			"broadcasts",
			"committees",
			"committee_divisions",
			"committee_members",
			"dt_memberships",
			"dt_assignment_histories",
			"dt_audits",
			"events",
			"event_participants",
			"attendance_sessions",
			"attendance_records",
			"violations_reports",
			"violations_audits",
			"evaluation_periods",
			"evaluation_period_events",
			"evaluation_event_scores",
			"evaluation_department_scores",
			"evaluation_gform_responses",
			"evaluation_attendance_fallbacks",
			"evaluation_point_transactions",
			"evaluation_result_snapshots",
			"evaluation_audits",
		] as const;

		console.info("DEV dummy seeder completed successfully. Row counts:");
		for (const tableName of summaryTables) {
			const res = await db.$client.query(
				`SELECT count(*)::int AS c FROM "${tableName}"`,
			);
			console.info(`  ${tableName}: ${res.rows[0]?.c ?? 0}`);
		}
	} finally {
		await db.$client.end();
	}
}

await main();
