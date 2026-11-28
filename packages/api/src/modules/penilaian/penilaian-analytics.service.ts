import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import {
	evaluationAttendanceFallbacks,
	evaluationAudits,
	evaluationDepartmentScores,
	evaluationEventScores,
	evaluationGformResponses,
	evaluationPeriodEvents,
	evaluationPeriods,
	evaluationPointTransactions,
	evaluationResultSnapshots,
} from "@resora/db/schema/penilaian";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import { readEvent } from "../events/events.public";
import {
	getUserDisplayNames,
	readOperationalIdentity,
} from "../identity/identity.public";
import type {
	evaluationAuditHistorySchema,
	evaluationDashboardSummarySchema,
	memberDetailSchema,
	ownRecapSchema,
	recapFilterSchema,
} from "./penilaian.contracts";
import {
	evaluationAuditHistorySchema as auditSchema,
	evaluationDashboardSummarySchema as dashboardSchema,
	memberDetailSchema as detailSchema,
	ownRecapSchema as ownSchema,
	recapFilterSchema as recapSchema,
} from "./penilaian.contracts";
import {
	canReadPenilaianModule,
	canViewCommentsAndEvaluatorIdentity,
	canViewFinalAllMembers,
	canViewPreFinalResults,
} from "./penilaian-policy";
import { loadLivePeriodComputation } from "./penilaian-recap.service";

type ProjectedRecapMember = {
	userId: string;
	nim: string;
	name: string;
	departmentCode: string;
	positionCode: string;
	buildingCode: string;
	buildingName: string;
	annualWeighted: number | null;
	monthlyWeighted: number | null;
	weeklyWeighted: number | null;
	departmentWeighted: number | null;
	gformWeighted: number | null;
	totalWeightedScore: number | null;
	attendancePointsTotal: number;
	netAdjustmentPoints: number;
	externalScoreAverage: number | null;
	isComplete: boolean;
	missingComponents: string[];
	thresholdStatus: "MEMENUHI_STANDAR" | "PERLU_PENINGKATAN" | null;
	componentBreakdown?: Record<string, unknown>;
};

function fail(
	code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT",
	message: string,
): never {
	throw new TRPCError({ code, message });
}

function csvCell(value: unknown, preserveText = false): string {
	if (value === null || value === undefined) return "";
	let text = String(value);
	if (/^[=+\-@\t\r]/.test(text) || preserveText) {
		text = `'${text}`;
	}
	return `"${text.replace(/"/g, '""')}"`;
}

function roundDisplay(value: number | null): number | null {
	if (value === null) return null;
	return Math.round(value * 100) / 100;
}

type StoredEventBreakdown = {
	periodEventId: string;
	eventId: string;
	title: string;
	category: "ANNUAL" | "MONTHLY" | "WEEKLY";
	weight: number;
	isMandatory: boolean;
	expectedEvaluators: number;
	submittedEvaluators: number;
	rawAverage: number | null;
	weightedScore: number | null;
	isComplete: boolean;
};

async function loadMemberDetailedBreakdown(
	tx: Database | DatabaseTransaction,
	params: {
		evaluationPeriodId: string;
		targetUserId: string;
		member: ProjectedRecapMember;
		includeSensitive: boolean;
		includeAllTxStatuses: boolean;
	},
) {
	const [
		periodEvents,
		eventScores,
		deptScores,
		attendanceFallbacks,
		pointTransactions,
		gformResponses,
	] = await Promise.all([
		tx
			.select()
			.from(evaluationPeriodEvents)
			.where(
				eq(
					evaluationPeriodEvents.evaluationPeriodId,
					params.evaluationPeriodId,
				),
			),
		tx
			.select()
			.from(evaluationEventScores)
			.where(
				and(
					eq(
						evaluationEventScores.evaluationPeriodId,
						params.evaluationPeriodId,
					),
					eq(evaluationEventScores.targetUserId, params.targetUserId),
				),
			),
		tx
			.select()
			.from(evaluationDepartmentScores)
			.where(
				and(
					eq(
						evaluationDepartmentScores.evaluationPeriodId,
						params.evaluationPeriodId,
					),
					eq(evaluationDepartmentScores.targetUserId, params.targetUserId),
				),
			),
		tx
			.select()
			.from(evaluationAttendanceFallbacks)
			.where(
				and(
					eq(
						evaluationAttendanceFallbacks.evaluationPeriodId,
						params.evaluationPeriodId,
					),
					eq(evaluationAttendanceFallbacks.targetUserId, params.targetUserId),
				),
			),
		tx
			.select()
			.from(evaluationPointTransactions)
			.where(
				and(
					eq(
						evaluationPointTransactions.evaluationPeriodId,
						params.evaluationPeriodId,
					),
					eq(evaluationPointTransactions.targetUserId, params.targetUserId),
				),
			),
		params.includeSensitive
			? tx
					.select()
					.from(evaluationGformResponses)
					.where(
						and(
							eq(
								evaluationGformResponses.evaluationPeriodId,
								params.evaluationPeriodId,
							),
							eq(evaluationGformResponses.targetUserId, params.targetUserId),
						),
					)
			: Promise.resolve([]),
	]);

	const cb = params.member.componentBreakdown as
		| {
				eventBreakdowns?: StoredEventBreakdown[];
				departmentScoreAverage?: number | null;
				gformScoreAverage?: number | null;
				resoraAttendancePoints?: number;
				fallbackAttendancePoints?: number;
				approvedAdditionPoints?: number;
				approvedDeductionPoints?: number;
				externalResponseCount?: number;
		  }
		| undefined;

	const rawEventTitleMap = new Map<string, string>();
	for (const pe of periodEvents) {
		const storedTitle = cb?.eventBreakdowns?.find(
			(item) => item.periodEventId === pe.id,
		)?.title;
		if (storedTitle) {
			rawEventTitleMap.set(pe.id, storedTitle);
		} else {
			const [evt] = await readEvent(tx, pe.eventId);
			rawEventTitleMap.set(pe.id, evt?.title ?? pe.eventId);
		}
	}

	const eventIndicatorMap = new Map<
		string,
		{
			commitment: number;
			teamwork: number;
			attitude: number;
			contribution: number;
			count: number;
		}
	>();
	for (const row of eventScores) {
		const curr = eventIndicatorMap.get(row.periodEventId) ?? {
			commitment: 0,
			teamwork: 0,
			attitude: 0,
			contribution: 0,
			count: 0,
		};
		curr.commitment += row.commitment;
		curr.teamwork += row.teamwork;
		curr.attitude += row.attitude;
		curr.contribution += row.contribution;
		curr.count++;
		eventIndicatorMap.set(row.periodEventId, curr);
	}

	const storedEvents = cb?.eventBreakdowns ?? [];
	const eventHistory = storedEvents.map((evt) => {
		const ind = eventIndicatorMap.get(evt.periodEventId);
		return {
			periodEventId: evt.periodEventId,
			title: evt.title,
			category: evt.category,
			weight: evt.weight,
			isMandatory: evt.isMandatory,
			expectedEvaluators: evt.expectedEvaluators,
			submittedEvaluators: evt.submittedEvaluators,
			rawAverage: roundDisplay(evt.rawAverage),
			weightedScore: roundDisplay(evt.weightedScore),
			isComplete: evt.isComplete,
			indicators: ind?.count
				? {
						commitment: roundDisplay(ind.commitment / ind.count),
						teamwork: roundDisplay(ind.teamwork / ind.count),
						attitude: roundDisplay(ind.attitude / ind.count),
						contribution: roundDisplay(ind.contribution / ind.count),
					}
				: null,
		};
	});

	const deptByQuarter = new Map<number, typeof deptScores>();
	for (const row of deptScores) {
		const bucket = deptByQuarter.get(row.quarterNumber) ?? [];
		bucket.push(row);
		deptByQuarter.set(row.quarterNumber, bucket);
	}
	const departmentQuarters = [...deptByQuarter.entries()]
		.sort(([a], [b]) => a - b)
		.map(([quarterNumber, rows]) => {
			const len = rows.length;
			const commitment = rows.reduce((s, r) => s + r.commitment, 0) / len;
			const teamwork = rows.reduce((s, r) => s + r.teamwork, 0) / len;
			const attitude = rows.reduce((s, r) => s + r.attitude, 0) / len;
			const contribution = rows.reduce((s, r) => s + r.contribution, 0) / len;
			const rawAvg = (commitment + teamwork + attitude + contribution) / 4;
			return {
				quarterNumber,
				evaluatorCount: len,
				commitment: roundDisplay(commitment),
				teamwork: roundDisplay(teamwork),
				attitude: roundDisplay(attitude),
				contribution: roundDisplay(contribution),
				rawAverage: roundDisplay(rawAvg),
				weightedScore: roundDisplay(rawAvg * 0.25),
			};
		});

	const visibleTx = pointTransactions.filter(
		(txRow) => params.includeAllTxStatuses || txRow.status === "APPROVED",
	);

	let evaluatorDetails: {
		eventScores: Array<{
			id: string;
			eventTitle: string;
			evaluatorName: string;
			commitment: number;
			teamwork: number;
			attitude: number;
			contribution: number;
			averageScore: number | null;
			comment: string | null;
		}>;
		departmentScores: Array<{
			id: string;
			quarterNumber: number;
			evaluatorName: string;
			commitment: number;
			teamwork: number;
			attitude: number;
			contribution: number;
			averageScore: number | null;
			comment: string | null;
		}>;
		gformResponses: Array<{
			id: string;
			sourceType: "SR_MABA" | "EXTERNAL_ASUS_DITMAWA";
			cycleNumber: number;
			respondentKey: string;
			respondentRole: string;
			totalScore: number;
			comment: string | null;
		}>;
	} | null = null;

	if (params.includeSensitive) {
		const evaluatorNames = await getUserDisplayNames(tx, [
			...eventScores.map((r) => r.evaluatorUserId),
			...deptScores.map((r) => r.evaluatorUserId),
		]);
		evaluatorDetails = {
			eventScores: eventScores.map((r) => ({
				id: r.id,
				eventTitle: rawEventTitleMap.get(r.periodEventId) ?? r.periodEventId,
				evaluatorName:
					evaluatorNames.get(r.evaluatorUserId) ?? r.evaluatorUserId,
				commitment: r.commitment,
				teamwork: r.teamwork,
				attitude: r.attitude,
				contribution: r.contribution,
				averageScore: roundDisplay(
					(r.commitment + r.teamwork + r.attitude + r.contribution) / 4,
				),
				comment: r.comment,
			})),
			departmentScores: deptScores.map((r) => ({
				id: r.id,
				quarterNumber: r.quarterNumber,
				evaluatorName:
					evaluatorNames.get(r.evaluatorUserId) ?? r.evaluatorUserId,
				commitment: r.commitment,
				teamwork: r.teamwork,
				attitude: r.attitude,
				contribution: r.contribution,
				averageScore: roundDisplay(
					(r.commitment + r.teamwork + r.attitude + r.contribution) / 4,
				),
				comment: r.comment,
			})),
			gformResponses: gformResponses.map((r) => ({
				id: r.id,
				sourceType: r.sourceType,
				cycleNumber: r.cycleNumber,
				respondentKey: r.respondentKey,
				respondentRole: r.respondentRole,
				totalScore: r.totalScore,
				comment: r.comment,
			})),
		};
	}

	return {
		eventHistory,
		departmentQuarters,
		departmentScoreAverage: roundDisplay(cb?.departmentScoreAverage ?? null),
		gformScoreAverage: roundDisplay(cb?.gformScoreAverage ?? null),
		externalResponseCount: cb?.externalResponseCount ?? 0,
		resoraAttendancePoints:
			cb?.resoraAttendancePoints ?? params.member.attendancePointsTotal,
		fallbackAttendancePoints: cb?.fallbackAttendancePoints ?? 0,
		fallbackEntries: attendanceFallbacks.map((fb) => ({
			id: fb.id,
			activityType: fb.activityType,
			activityTitle: fb.activityTitle,
			activityDate: fb.activityDate,
			attendanceStatus: fb.attendanceStatus,
			earnedPoints: fb.earnedPoints,
			maxPoints: fb.maxPoints,
		})),
		approvedAdditionPoints: cb?.approvedAdditionPoints ?? 0,
		approvedDeductionPoints: cb?.approvedDeductionPoints ?? 0,
		pointTransactions: visibleTx.map((pt) => ({
			id: pt.id,
			transactionType: pt.transactionType,
			points: pt.points,
			category: pt.category,
			reason: pt.reason,
			occurredOn: pt.occurredOn,
			status: pt.status,
		})),
		evaluatorDetails,
	};
}

async function loadPeriodDataset(
	tx: Database | DatabaseTransaction,
	period: {
		id: string;
		srPeriodId: string;
		name: string;
		status: "OPEN" | "FINAL" | "REVISING";
		version: number;
		performanceThreshold: number | null;
		finalizedAt: Date | null;
	},
): Promise<{
	readinessStatus:
		| "BELUM_TERSEDIA"
		| "BELUM_LENGKAP"
		| "SIAP_DIFINALISASI"
		| "FINAL";
	members: ProjectedRecapMember[];
}> {
	if (period.status === "FINAL") {
		const snapshots = await tx
			.select()
			.from(evaluationResultSnapshots)
			.where(
				and(
					eq(evaluationResultSnapshots.evaluationPeriodId, period.id),
					eq(evaluationResultSnapshots.version, period.version),
				),
			);
		return {
			readinessStatus: "FINAL",
			members: snapshots.map((snap) => ({
				userId: snap.targetUserId,
				nim: snap.snapshotNim,
				name: snap.snapshotName,
				departmentCode: snap.snapshotDepartmentCode,
				positionCode: snap.snapshotPositionCode,
				buildingCode: snap.snapshotBuildingCode,
				buildingName: snap.snapshotBuildingName,
				annualWeighted: snap.annualWeighted,
				monthlyWeighted: snap.monthlyWeighted,
				weeklyWeighted: snap.weeklyWeighted,
				departmentWeighted: snap.departmentWeighted,
				gformWeighted: snap.gformWeighted,
				totalWeightedScore: snap.totalWeightedScore,
				attendancePointsTotal: snap.attendancePointsTotal,
				netAdjustmentPoints: snap.netAdjustmentPoints,
				externalScoreAverage: snap.externalScoreAverage,
				isComplete: true,
				missingComponents: [],
				thresholdStatus:
					period.performanceThreshold !== null
						? snap.totalWeightedScore >= period.performanceThreshold
							? "MEMENUHI_STANDAR"
							: "PERLU_PENINGKATAN"
						: null,
				componentBreakdown: snap.componentBreakdown,
			})),
		};
	}

	const live = await loadLivePeriodComputation(tx, period);
	return {
		readinessStatus: live.readinessStatus,
		members: live.members.map((m) => ({
			userId: m.target.userId,
			nim: m.target.nim,
			name: m.target.name,
			departmentCode: m.target.departmentCode,
			positionCode: m.target.positionCode,
			buildingCode: m.target.buildingCode,
			buildingName: m.target.buildingName,
			annualWeighted: m.annualWeighted,
			monthlyWeighted: m.monthlyWeighted,
			weeklyWeighted: m.weeklyWeighted,
			departmentWeighted: m.departmentWeighted,
			gformWeighted: m.gformWeighted,
			totalWeightedScore: m.totalWeightedScore,
			attendancePointsTotal: m.attendancePointsTotal,
			netAdjustmentPoints: m.netAdjustmentPoints,
			externalScoreAverage: m.externalScoreAverage,
			isComplete: m.isComplete,
			missingComponents: m.missingComponents,
			thresholdStatus: m.thresholdStatus,
			componentBreakdown: {
				eventBreakdowns: m.eventBreakdowns,
				departmentScoreAverage: m.departmentScoreAverage,
				gformScoreAverage: m.gformScoreAverage,
				resoraAttendancePoints: m.resoraAttendancePoints,
				fallbackAttendancePoints: m.fallbackAttendancePoints,
				approvedAdditionPoints: m.approvedAdditionPoints,
				approvedDeductionPoints: m.approvedDeductionPoints,
				externalResponseCount: m.externalResponseCount,
			},
		})),
	};
}

function applyScopeAndFilters(
	members: ProjectedRecapMember[],
	live: NonNullable<Awaited<ReturnType<typeof readOperationalIdentity>>>,
	filter: z.infer<typeof recapFilterSchema>,
) {
	const canSeeAll = canViewFinalAllMembers(live);
	const query = filter.query?.trim().toLowerCase() ?? "";
	const dept = filter.departmentCode?.trim().toUpperCase();
	const bldg = filter.buildingCode?.trim().toUpperCase();

	return members.filter((row) => {
		if (!canSeeAll && row.userId !== live.userId) return false;
		if (dept && row.departmentCode.toUpperCase() !== dept) return false;
		if (bldg && row.buildingCode.toUpperCase() !== bldg) return false;
		if (
			query &&
			!row.nim.toLowerCase().includes(query) &&
			!row.name.toLowerCase().includes(query)
		)
			return false;
		return true;
	});
}

export async function getEvaluationRecapList(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof recapFilterSchema>,
) {
	if (!canReadPenilaianModule(identity))
		fail("FORBIDDEN", "EVALUATION_ACCESS_DENIED");
	const filter = recapSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!live || !canReadPenilaianModule(live))
				fail("FORBIDDEN", "EVALUATION_ACCESS_DENIED");

			const [period] = await tx
				.select()
				.from(evaluationPeriods)
				.where(eq(evaluationPeriods.id, filter.evaluationPeriodId));
			if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");

			if (!canViewPreFinalResults(live) && period.status !== "FINAL")
				fail("FORBIDDEN", "EVALUATION_PREFINAL_ACCESS_DENIED");

			const dataset = await loadPeriodDataset(tx, period);
			const scoped = applyScopeAndFilters(dataset.members, live, filter);

			return {
				period: {
					id: period.id,
					name: period.name,
					status: period.status,
					version: period.version,
					performanceThreshold: period.performanceThreshold,
					finalizedAt: period.finalizedAt,
				},
				readinessStatus: dataset.readinessStatus,
				rows: scoped.map(({ componentBreakdown: _cb, ...row }) => ({
					...row,
					annualWeighted: roundDisplay(row.annualWeighted),
					monthlyWeighted: roundDisplay(row.monthlyWeighted),
					weeklyWeighted: roundDisplay(row.weeklyWeighted),
					departmentWeighted: roundDisplay(row.departmentWeighted),
					gformWeighted: roundDisplay(row.gformWeighted),
					totalWeightedScore: roundDisplay(row.totalWeightedScore),
					externalScoreAverage: roundDisplay(row.externalScoreAverage),
				})),
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function getEvaluationMemberDetail(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof memberDetailSchema>,
) {
	if (!canReadPenilaianModule(identity))
		fail("FORBIDDEN", "EVALUATION_ACCESS_DENIED");
	const data = detailSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!live || !canReadPenilaianModule(live))
				fail("FORBIDDEN", "EVALUATION_ACCESS_DENIED");

			const [period] = await tx
				.select()
				.from(evaluationPeriods)
				.where(eq(evaluationPeriods.id, data.evaluationPeriodId));
			if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");

			if (!canViewPreFinalResults(live) && period.status !== "FINAL")
				fail("FORBIDDEN", "EVALUATION_PREFINAL_ACCESS_DENIED");

			if (!canViewFinalAllMembers(live) && data.targetUserId !== live.userId)
				fail("FORBIDDEN", "EVALUATION_TARGET_ACCESS_DENIED");

			const dataset = await loadPeriodDataset(tx, period);
			const member = dataset.members.find(
				(row) => row.userId === data.targetUserId,
			);
			if (!member) fail("NOT_FOUND", "EVALUATION_MEMBER_NOT_FOUND");

			const includeSensitive = canViewCommentsAndEvaluatorIdentity(live);
			const detailed = await loadMemberDetailedBreakdown(tx, {
				evaluationPeriodId: period.id,
				targetUserId: member.userId,
				member,
				includeSensitive,
				includeAllTxStatuses: canViewPreFinalResults(live),
			});
			const { componentBreakdown: _cb, ...memberSummary } = member;

			return {
				period: {
					id: period.id,
					name: period.name,
					status: period.status,
					version: period.version,
					performanceThreshold: period.performanceThreshold,
					finalizedAt: period.finalizedAt,
				},
				member: {
					...memberSummary,
					annualWeighted: roundDisplay(memberSummary.annualWeighted),
					monthlyWeighted: roundDisplay(memberSummary.monthlyWeighted),
					weeklyWeighted: roundDisplay(memberSummary.weeklyWeighted),
					departmentWeighted: roundDisplay(memberSummary.departmentWeighted),
					gformWeighted: roundDisplay(memberSummary.gformWeighted),
					totalWeightedScore: roundDisplay(memberSummary.totalWeightedScore),
					externalScoreAverage: roundDisplay(
						memberSummary.externalScoreAverage,
					),
					detailed,
				},
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function getOwnEvaluationRecap(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof ownRecapSchema>,
) {
	if (identity.actor !== "SR") fail("FORBIDDEN", "SR_IDENTITY_REQUIRED");
	const data = ownSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (live?.actor !== "SR") fail("FORBIDDEN", "SR_IDENTITY_REQUIRED");

			const [period] = data.evaluationPeriodId
				? await tx
						.select()
						.from(evaluationPeriods)
						.where(eq(evaluationPeriods.id, data.evaluationPeriodId))
				: await tx
						.select()
						.from(evaluationPeriods)
						.orderBy(
							desc(evaluationPeriods.isActive),
							desc(evaluationPeriods.createdAt),
						)
						.limit(1);

			if (!period) {
				return {
					status: "BELUM_TERSEDIA" as const,
					period: null,
					recap: null,
				};
			}

			if (period.status !== "FINAL") {
				return {
					status: "BELUM_FINAL" as const,
					period: {
						id: period.id,
						name: period.name,
						status: "BELUM_FINAL" as const,
						version: period.version,
					},
					recap: null,
				};
			}

			const dataset = await loadPeriodDataset(tx, period);
			const own = dataset.members.find((m) => m.userId === live.userId) ?? null;
			const detailed = own
				? await loadMemberDetailedBreakdown(tx, {
						evaluationPeriodId: period.id,
						targetUserId: own.userId,
						member: own,
						// Own personal recap never exposes evaluator identities or comments (FR-EVAL-027/036).
						includeSensitive: false,
						includeAllTxStatuses: false,
					})
				: null;
			const ownSummary = own
				? (({ componentBreakdown: _cb, ...rest }) => rest)(own)
				: null;

			return {
				status: "FINAL" as const,
				period: {
					id: period.id,
					name: period.name,
					status: "FINAL" as const,
					version: period.version,
					performanceThreshold: period.performanceThreshold,
					finalizedAt: period.finalizedAt,
				},
				recap:
					ownSummary && detailed
						? {
								...ownSummary,
								annualWeighted: roundDisplay(ownSummary.annualWeighted),
								monthlyWeighted: roundDisplay(ownSummary.monthlyWeighted),
								weeklyWeighted: roundDisplay(ownSummary.weeklyWeighted),
								departmentWeighted: roundDisplay(ownSummary.departmentWeighted),
								gformWeighted: roundDisplay(ownSummary.gformWeighted),
								totalWeightedScore: roundDisplay(ownSummary.totalWeightedScore),
								externalScoreAverage: roundDisplay(
									ownSummary.externalScoreAverage,
								),
								detailed,
							}
						: null,
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function getEvaluationAnalytics(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof recapFilterSchema>,
) {
	if (!canViewFinalAllMembers(identity))
		fail("FORBIDDEN", "EVALUATION_ANALYTICS_ACCESS_DENIED");
	const filter = recapSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!live || !canViewFinalAllMembers(live))
				fail("FORBIDDEN", "EVALUATION_ANALYTICS_ACCESS_DENIED");

			const [period] = await tx
				.select()
				.from(evaluationPeriods)
				.where(eq(evaluationPeriods.id, filter.evaluationPeriodId));
			if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");

			if (!canViewPreFinalResults(live) && period.status !== "FINAL")
				fail("FORBIDDEN", "EVALUATION_PREFINAL_ACCESS_DENIED");

			const dataset = await loadPeriodDataset(tx, period);
			const filtered = applyScopeAndFilters(dataset.members, live, filter);
			const completeMembers = filtered.filter(
				(m): m is ProjectedRecapMember & { totalWeightedScore: number } =>
					m.isComplete && m.totalWeightedScore !== null,
			);

			const totalSr = filtered.length;
			const assessedCount = completeMembers.length;
			const unassessedCount = totalSr - assessedCount;
			const completionPercentage =
				totalSr > 0 ? Math.round((assessedCount / totalSr) * 1000) / 10 : 0;

			const scores = completeMembers.map((m) => m.totalWeightedScore);
			const averageTotalScore = scores.length
				? roundDisplay(scores.reduce((a, b) => a + b, 0) / scores.length)
				: null;
			const minTotalScore = scores.length
				? roundDisplay(Math.min(...scores))
				: null;
			const maxTotalScore = scores.length
				? roundDisplay(Math.max(...scores))
				: null;

			const buckets = [
				{ label: "< 60", count: 0 },
				{ label: "60–79,9", count: 0 },
				{ label: "80–99,9", count: 0 },
				{ label: "100–119,9", count: 0 },
				{ label: ">= 120", count: 0 },
			] as const;
			const counts = [0, 0, 0, 0, 0];
			for (const score of scores) {
				const idx =
					score < 60
						? 0
						: score < 80
							? 1
							: score < 100
								? 2
								: score < 120
									? 3
									: 4;
				counts[idx] = (counts[idx] ?? 0) + 1;
			}
			const distribution = buckets.map((bucket, idx) => ({
				label: bucket.label,
				count: counts[idx] ?? 0,
			}));

			const deptAgg = new Map<
				string,
				{ count: number; assessed: number; sum: number }
			>();
			const bldgAgg = new Map<
				string,
				{ buildingName: string; count: number; assessed: number; sum: number }
			>();
			for (const row of filtered) {
				const d = deptAgg.get(row.departmentCode) ?? {
					count: 0,
					assessed: 0,
					sum: 0,
				};
				d.count++;
				if (row.totalWeightedScore !== null) {
					d.assessed++;
					d.sum += row.totalWeightedScore;
				}
				deptAgg.set(row.departmentCode, d);

				const b = bldgAgg.get(row.buildingCode) ?? {
					buildingName: row.buildingName || row.buildingCode,
					count: 0,
					assessed: 0,
					sum: 0,
				};
				b.count++;
				if (row.totalWeightedScore !== null) {
					b.assessed++;
					b.sum += row.totalWeightedScore;
				}
				bldgAgg.set(row.buildingCode, b);
			}

			return {
				period: {
					id: period.id,
					name: period.name,
					status: period.status,
					version: period.version,
					performanceThreshold: period.performanceThreshold,
				},
				readinessStatus: dataset.readinessStatus,
				summary: {
					totalSr,
					assessedCount,
					unassessedCount,
					completionPercentage,
					averageTotalScore,
					minTotalScore,
					maxTotalScore,
				},
				distribution,
				byDepartment: [...deptAgg.entries()].map(([departmentCode, val]) => ({
					departmentCode,
					totalSr: val.count,
					assessedCount: val.assessed,
					averageTotalScore: val.assessed
						? roundDisplay(val.sum / val.assessed)
						: null,
				})),
				byBuilding: [...bldgAgg.entries()].map(([buildingCode, val]) => ({
					buildingCode,
					buildingName: val.buildingName,
					totalSr: val.count,
					assessedCount: val.assessed,
					averageTotalScore: val.assessed
						? roundDisplay(val.sum / val.assessed)
						: null,
				})),
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function exportEvaluationRecapCsv(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof recapFilterSchema>,
) {
	const filter = recapSchema.parse(input);
	if (filter.aggregateOnly) {
		const analytics = await getEvaluationAnalytics(db, identity, filter);
		const headers = [
			"Departemen",
			"Jumlah SR",
			"Sudah Lengkap",
			"Rata-rata Nilai Total",
		];
		const lines = [
			headers.map((h) => csvCell(h)).join(","),
			...analytics.byDepartment.map((row) =>
				[
					csvCell(row.departmentCode),
					String(row.totalSr),
					String(row.assessedCount),
					row.averageTotalScore === null ? "" : String(row.averageTotalScore),
				].join(","),
			),
		];
		return {
			filename: `penilaian-agregat-${analytics.period.id}-v${analytics.period.version}.csv`,
			content: `\uFEFF${lines.join("\r\n")}\r\n`,
		};
	}

	const recap = await getEvaluationRecapList(db, identity, filter);
	const headers = [
		"NIM",
		"Nama",
		"Departemen",
		"Jabatan",
		"Gedung",
		"Status Kelengkapan",
		"Event Tahunan (25%)",
		"Event Bulanan (10%)",
		"Event Mingguan (10%)",
		"Departemen (25%)",
		"GForm SR/Maba (50%)",
		"Total Nilai Berbobot",
		"Poin Kehadiran",
		"Poin Bersih (+/-)",
		"Evaluasi Eksternal",
		"Status Ambang",
	];
	const lines = [
		headers.map((h) => csvCell(h)).join(","),
		...recap.rows.map((row) =>
			[
				csvCell(row.nim, true),
				csvCell(row.name),
				csvCell(row.departmentCode),
				csvCell(row.positionCode),
				csvCell(row.buildingName || row.buildingCode),
				csvCell(row.isComplete ? "Lengkap" : "Belum lengkap"),
				row.annualWeighted ?? "",
				row.monthlyWeighted ?? "",
				row.weeklyWeighted ?? "",
				row.departmentWeighted ?? "",
				row.gformWeighted ?? "",
				row.totalWeightedScore ?? "",
				row.attendancePointsTotal,
				row.netAdjustmentPoints,
				row.externalScoreAverage ?? "",
				csvCell(row.thresholdStatus ?? "Belum ditetapkan"),
			]
				.map((cell) => (typeof cell === "number" ? String(cell) : String(cell)))
				.join(","),
		),
	];

	return {
		filename: `penilaian-rekap-${recap.period.id}-v${recap.period.version}.csv`,
		content: `\uFEFF${lines.join("\r\n")}\r\n`,
	};
}

// FR-DASH-003 source summary for Dashboard Utama RESORA (no client-side score calculation).
export async function getEvaluationDashboardSummary(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof evaluationDashboardSummarySchema>,
) {
	if (!canReadPenilaianModule(identity))
		fail("FORBIDDEN", "EVALUATION_ACCESS_DENIED");
	const { mode } = dashboardSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!live || !canReadPenilaianModule(live))
				fail("FORBIDDEN", "EVALUATION_ACCESS_DENIED");

			const [period] = await tx
				.select()
				.from(evaluationPeriods)
				.where(eq(evaluationPeriods.isActive, true))
				.limit(1);

			if (!period) {
				return {
					mode,
					state: "missing_period" as const,
					periodName: null,
					message: "Periode evaluasi aktif belum ditetapkan.",
				};
			}

			if (mode === "management") {
				const canManageView =
					canViewPreFinalResults(live) ||
					(period.status === "FINAL" && canViewFinalAllMembers(live));
				if (!canManageView)
					fail("FORBIDDEN", "EVALUATION_MANAGEMENT_SUMMARY_DENIED");

				const dataset = await loadPeriodDataset(tx, period);
				const assessed = dataset.members.filter(
					(m): m is ProjectedRecapMember & { totalWeightedScore: number } =>
						m.isComplete && m.totalWeightedScore !== null,
				);
				const total = dataset.members.length;
				const averageScore = assessed.length
					? roundDisplay(
							assessed.reduce((sum, m) => sum + m.totalWeightedScore, 0) /
								assessed.length,
						)
					: null;
				const completionPercentage =
					total > 0 ? Math.round((assessed.length / total) * 1000) / 10 : 0;

				return {
					mode: "management" as const,
					state: "ready_summary" as const,
					periodId: period.id,
					periodName: period.name,
					isFinalized: period.status === "FINAL",
					readinessStatus: dataset.readinessStatus,
					averageScore,
					completionPercentage,
					assessedCount: assessed.length,
					unassessedCount: total - assessed.length,
				};
			}

			if (live.actor !== "SR") {
				return {
					mode: "personal" as const,
					state: "unavailable" as const,
					periodId: period.id,
					periodName: period.name,
					message: "Akun sistem tidak memiliki nilai kinerja SR pribadi.",
				};
			}

			if (period.status !== "FINAL") {
				return {
					mode: "personal" as const,
					state: "not_assessed" as const,
					periodId: period.id,
					periodName: period.name,
					message: "Hasil penilaian periode aktif belum difinalisasi.",
				};
			}

			const dataset = await loadPeriodDataset(tx, period);
			const own = dataset.members.find((m) => m.userId === live.userId);
			if (!own || own.totalWeightedScore === null) {
				return {
					mode: "personal" as const,
					state: "not_assessed" as const,
					periodId: period.id,
					periodName: period.name,
					message: "Data penilaian pribadi belum tersedia pada periode ini.",
				};
			}

			return {
				mode: "personal" as const,
				state: "ready" as const,
				periodId: period.id,
				periodName: period.name,
				finalScore: roundDisplay(own.totalWeightedScore),
				completionPercentage: own.isComplete ? 100 : 0,
				attendancePointsTotal: own.attendancePointsTotal,
				netAdjustmentPoints: own.netAdjustmentPoints,
				thresholdStatus: own.thresholdStatus,
				components: {
					annualWeighted: roundDisplay(own.annualWeighted),
					monthlyWeighted: roundDisplay(own.monthlyWeighted),
					weeklyWeighted: roundDisplay(own.weeklyWeighted),
					departmentWeighted: roundDisplay(own.departmentWeighted),
					gformWeighted: roundDisplay(own.gformWeighted),
					externalScoreAverage: roundDisplay(own.externalScoreAverage),
				},
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function listEvaluationAudits(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof evaluationAuditHistorySchema>,
) {
	if (!canViewPreFinalResults(identity))
		fail("FORBIDDEN", "EVALUATION_AUDIT_ACCESS_DENIED");
	const data = auditSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!canViewPreFinalResults(live))
				fail("FORBIDDEN", "EVALUATION_AUDIT_ACCESS_DENIED");

			const rows = await tx
				.select()
				.from(evaluationAudits)
				.where(
					and(
						eq(evaluationAudits.evaluationPeriodId, data.evaluationPeriodId),
						data.targetUserId
							? eq(evaluationAudits.targetUserId, data.targetUserId)
							: undefined,
					),
				)
				.orderBy(desc(evaluationAudits.createdAt));

			const names = await getUserDisplayNames(
				tx,
				rows.flatMap((r) => [
					r.actorUserId,
					...(r.targetUserId ? [r.targetUserId] : []),
				]),
			);

			return rows.map((row) => ({
				...row,
				actorName: names.get(row.actorUserId) ?? null,
				targetName: row.targetUserId
					? (names.get(row.targetUserId) ?? null)
					: null,
			}));
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}
