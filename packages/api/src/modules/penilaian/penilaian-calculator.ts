import {
	EVALUATION_WEIGHTS,
	type EvaluationReadinessStatus,
} from "./penilaian.contracts";

export type IndicatorInput = {
	commitment: number;
	teamwork: number;
	attitude: number;
	contribution: number;
};

export type EventScoreInput = IndicatorInput & {
	id: string;
	periodEventId: string;
	evaluatorUserId: string;
	targetUserId: string;
};

export type DepartmentScoreInput = IndicatorInput & {
	id: string;
	quarterNumber: number;
	evaluatorUserId: string;
	targetUserId: string;
};

export type GformResponseInput = {
	sourceType: "SR_MABA" | "EXTERNAL_ASUS_DITMAWA";
	cycleNumber: number;
	targetUserId: string;
	totalScore: number;
};

export type PeriodEventConfigInput = {
	periodEventId: string;
	eventId: string;
	title: string;
	category: "ANNUAL" | "MONTHLY" | "WEEKLY";
	isMandatory: boolean;
	rosterUserIds: string[];
};

export type RosterTargetInput = {
	userId: string;
	nim: string;
	name: string;
	departmentCode: string;
	positionCode: string;
	buildingCode: string;
	buildingName: string;
};

export type MemberEventBreakdown = {
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

export type MemberEvaluationCalculation = {
	target: RosterTargetInput;
	eventBreakdowns: MemberEventBreakdown[];
	annualWeighted: number | null;
	monthlyWeighted: number | null;
	weeklyWeighted: number | null;
	departmentScoreAverage: number | null;
	departmentWeighted: number | null;
	gformScoreAverage: number | null;
	gformWeighted: number | null;
	totalWeightedScore: number | null;
	knownWeightedPartial: number;
	attendancePointsTotal: number;
	resoraAttendancePoints: number;
	fallbackAttendancePoints: number;
	netAdjustmentPoints: number;
	approvedAdditionPoints: number;
	approvedDeductionPoints: number;
	externalScoreAverage: number | null;
	externalResponseCount: number;
	missingComponents: string[];
	isComplete: boolean;
	thresholdStatus: "MEMENUHI_STANDAR" | "PERLU_PENINGKATAN" | null;
};

export function indicatorMean(input: IndicatorInput): number {
	return (
		(input.commitment + input.teamwork + input.attitude + input.contribution) /
		4
	);
}

function sumNullable(values: Array<number | null>): number | null {
	if (values.some((v) => v === null)) return null;
	return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

function sumKnown(values: Array<number | null>): number {
	return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

export function calculatePeriodEvaluations(params: {
	periodStatus: "OPEN" | "FINAL" | "REVISING";
	performanceThreshold: number | null;
	roster: RosterTargetInput[];
	periodEvents: PeriodEventConfigInput[];
	eventScores: EventScoreInput[];
	departmentScores: DepartmentScoreInput[];
	gformResponses: GformResponseInput[];
	attendanceByUserId: Map<
		string,
		{ resoraPoints: number; fallbackPoints: number }
	>;
	adjustmentsByUserId: Map<string, { additions: number; deductions: number }>;
}) {
	const eventRosterSets = new Map(
		params.periodEvents.map((pe) => [
			pe.periodEventId,
			new Set(pe.rosterUserIds),
		]),
	);

	const eventScoresByKey = new Map<string, EventScoreInput[]>();
	for (const score of params.eventScores) {
		const key = `${score.periodEventId}::${score.targetUserId}`;
		const list = eventScoresByKey.get(key) ?? [];
		list.push(score);
		eventScoresByKey.set(key, list);
	}

	const deptScoresByUser = new Map<string, DepartmentScoreInput[]>();
	for (const score of params.departmentScores) {
		const list = deptScoresByUser.get(score.targetUserId) ?? [];
		list.push(score);
		deptScoresByUser.set(score.targetUserId, list);
	}

	const gformByUser = new Map<string, GformResponseInput[]>();
	const externalByUser = new Map<string, GformResponseInput[]>();
	for (const resp of params.gformResponses) {
		const map = resp.sourceType === "SR_MABA" ? gformByUser : externalByUser;
		const list = map.get(resp.targetUserId) ?? [];
		list.push(resp);
		map.set(resp.targetUserId, list);
	}

	const members: MemberEvaluationCalculation[] = params.roster.map((target) => {
		const missingComponents: string[] = [];
		const eventBreakdowns: MemberEventBreakdown[] = [];

		for (const pe of params.periodEvents) {
			const rosterSet = eventRosterSets.get(pe.periodEventId);
			if (!rosterSet?.has(target.userId)) continue;

			const expectedEvaluators = Math.max(0, rosterSet.size - 1);
			const submitted =
				eventScoresByKey.get(`${pe.periodEventId}::${target.userId}`) ?? [];
			const hasValidEvaluators =
				expectedEvaluators > 0 && submitted.length >= expectedEvaluators;
			const weight = EVALUATION_WEIGHTS[pe.category];

			if (hasValidEvaluators) {
				const rawAverage =
					submitted.reduce((sum, item) => sum + indicatorMean(item), 0) /
					submitted.length;
				const weightedScore = rawAverage * weight;
				eventBreakdowns.push({
					periodEventId: pe.periodEventId,
					eventId: pe.eventId,
					title: pe.title,
					category: pe.category,
					weight,
					isMandatory: pe.isMandatory,
					expectedEvaluators,
					submittedEvaluators: submitted.length,
					rawAverage,
					weightedScore,
					isComplete: true,
				});
			} else {
				if (pe.isMandatory) {
					missingComponents.push(`Event ${pe.category}: ${pe.title}`);
				}
				eventBreakdowns.push({
					periodEventId: pe.periodEventId,
					eventId: pe.eventId,
					title: pe.title,
					category: pe.category,
					weight,
					isMandatory: pe.isMandatory,
					expectedEvaluators,
					submittedEvaluators: submitted.length,
					rawAverage: null,
					weightedScore: null,
					isComplete: false,
				});
			}
		}

		const byCategory = (cat: "ANNUAL" | "MONTHLY" | "WEEKLY") =>
			eventBreakdowns
				.filter((b) => b.category === cat && (b.isMandatory || b.isComplete))
				.map((b) => b.weightedScore);

		const annualWeighted = sumNullable(byCategory("ANNUAL"));
		const monthlyWeighted = sumNullable(byCategory("MONTHLY"));
		const weeklyWeighted = sumNullable(byCategory("WEEKLY"));

		// Department evaluation (25%): grouped by quarterNumber and summed across quarters.
		const deptRows = deptScoresByUser.get(target.userId) ?? [];
		let departmentScoreAverage: number | null = null;
		let departmentWeighted: number | null = null;
		if (deptRows.length === 0) {
			missingComponents.push("Penilaian Departemen (25%)");
		} else {
			const byQuarter = new Map<number, DepartmentScoreInput[]>();
			for (const row of deptRows) {
				const q = byQuarter.get(row.quarterNumber) ?? [];
				q.push(row);
				byQuarter.set(row.quarterNumber, q);
			}
			const quarterMeans: number[] = [];
			for (const qRows of byQuarter.values()) {
				const mean =
					qRows.reduce((sum, item) => sum + indicatorMean(item), 0) /
					qRows.length;
				quarterMeans.push(mean);
			}
			departmentScoreAverage =
				quarterMeans.reduce((sum, val) => sum + val, 0) / quarterMeans.length;
			departmentWeighted = quarterMeans.reduce(
				(sum, val) => sum + val * EVALUATION_WEIGHTS.DEPARTMENT,
				0,
			);
		}

		// GForm SR/Maba (50%): average per cycle * 0.50, summed across cycles.
		const gformRows = gformByUser.get(target.userId) ?? [];
		let gformScoreAverage: number | null = null;
		let gformWeighted: number | null = null;
		if (gformRows.length === 0) {
			missingComponents.push("Impor GForm SR & Maba (50%)");
		} else {
			const byCycle = new Map<number, GformResponseInput[]>();
			for (const row of gformRows) {
				const list = byCycle.get(row.cycleNumber) ?? [];
				list.push(row);
				byCycle.set(row.cycleNumber, list);
			}
			const cycleMeans: number[] = [];
			for (const cRows of byCycle.values()) {
				const mean =
					cRows.reduce((sum, item) => sum + item.totalScore, 0) / cRows.length;
				cycleMeans.push(mean);
			}
			gformScoreAverage =
				cycleMeans.reduce((sum, val) => sum + val, 0) / cycleMeans.length;
			gformWeighted = cycleMeans.reduce(
				(sum, val) => sum + val * EVALUATION_WEIGHTS.GFORM,
				0,
			);
		}

		const isComplete = missingComponents.length === 0;
		const totalWeightedScore =
			isComplete &&
			annualWeighted !== null &&
			monthlyWeighted !== null &&
			weeklyWeighted !== null &&
			departmentWeighted !== null &&
			gformWeighted !== null
				? annualWeighted +
					monthlyWeighted +
					weeklyWeighted +
					departmentWeighted +
					gformWeighted
				: null;

		const knownWeightedPartial =
			sumKnown(eventBreakdowns.map((b) => b.weightedScore)) +
			(departmentWeighted ?? 0) +
			(gformWeighted ?? 0);

		const attendance = params.attendanceByUserId.get(target.userId) ?? {
			resoraPoints: 0,
			fallbackPoints: 0,
		};
		const adjustment = params.adjustmentsByUserId.get(target.userId) ?? {
			additions: 0,
			deductions: 0,
		};
		const externalRows = externalByUser.get(target.userId) ?? [];
		const externalScoreAverage = externalRows.length
			? externalRows.reduce((sum, row) => sum + row.totalScore, 0) /
				externalRows.length
			: null;

		const thresholdStatus =
			params.performanceThreshold !== null && totalWeightedScore !== null
				? totalWeightedScore >= params.performanceThreshold
					? ("MEMENUHI_STANDAR" as const)
					: ("PERLU_PENINGKATAN" as const)
				: null;

		return {
			target,
			eventBreakdowns,
			annualWeighted,
			monthlyWeighted,
			weeklyWeighted,
			departmentScoreAverage,
			departmentWeighted,
			gformScoreAverage,
			gformWeighted,
			totalWeightedScore,
			knownWeightedPartial,
			resoraAttendancePoints: attendance.resoraPoints,
			fallbackAttendancePoints: attendance.fallbackPoints,
			attendancePointsTotal:
				Math.round(
					(attendance.resoraPoints + attendance.fallbackPoints) * 100,
				) / 100,
			approvedAdditionPoints: adjustment.additions,
			approvedDeductionPoints: adjustment.deductions,
			netAdjustmentPoints:
				Math.round((adjustment.additions - adjustment.deductions) * 100) / 100,
			externalScoreAverage,
			externalResponseCount: externalRows.length,
			missingComponents,
			isComplete,
			thresholdStatus,
		};
	});

	let readinessStatus: EvaluationReadinessStatus;
	if (params.periodStatus === "FINAL") {
		readinessStatus = "FINAL";
	} else if (
		params.roster.length === 0 ||
		(params.periodEvents.length === 0 &&
			params.departmentScores.length === 0 &&
			params.gformResponses.length === 0)
	) {
		readinessStatus = "BELUM_TERSEDIA";
	} else if (members.every((m) => m.isComplete)) {
		readinessStatus = "SIAP_DIFINALISASI";
	} else {
		readinessStatus = "BELUM_LENGKAP";
	}

	return {
		readinessStatus,
		assessedCount: members.filter((m) => m.isComplete).length,
		unassessedCount: members.filter((m) => !m.isComplete).length,
		totalRosterCount: members.length,
		members,
	};
}
