import { type AnyColumn, getColumnTable, getTableName, sql } from "drizzle-orm";
import { srPeriodMemberships, srPeriods } from "./schema/identity";

export type SrTenureStatus = "UNASSIGNED" | "SCHEDULED" | "ACTIVE" | "EXPIRED";

// Inclusive calendar dates in Jakarta. Evaluated on each statement, including after lock waits.
export function srTenureStatus(userId: AnyColumn) {
	const outerUserId = sql`${sql.identifier(getTableName(getColumnTable(userId)))}.${sql.identifier(userId.name)}`;
	const today = sql`(statement_timestamp() AT TIME ZONE 'Asia/Jakarta')::date`;
	return sql<SrTenureStatus>`CASE
		WHEN EXISTS (SELECT 1 FROM ${srPeriodMemberships} m JOIN ${srPeriods} p ON p.id = m.period_id
			WHERE m.user_id = ${outerUserId} AND p.starts_on <= ${today} AND p.ends_on >= ${today}) THEN 'ACTIVE'
		WHEN EXISTS (SELECT 1 FROM ${srPeriodMemberships} m JOIN ${srPeriods} p ON p.id = m.period_id
			WHERE m.user_id = ${outerUserId} AND p.ends_on < ${today}) THEN 'EXPIRED'
		WHEN EXISTS (SELECT 1 FROM ${srPeriodMemberships} m WHERE m.user_id = ${outerUserId}) THEN 'SCHEDULED'
		ELSE 'UNASSIGNED' END`;
}

export function srTenurePeriods(userId: AnyColumn) {
	const outerUserId = sql`${sql.identifier(getTableName(getColumnTable(userId)))}.${sql.identifier(userId.name)}`;
	return sql<
		{ id: string; name: string; startsOn: string; endsOn: string }[]
	>`COALESCE((
		SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'startsOn', p.starts_on, 'endsOn', p.ends_on) ORDER BY p.starts_on)
		FROM ${srPeriodMemberships} m JOIN ${srPeriods} p ON p.id = m.period_id WHERE m.user_id = ${outerUserId}
	), '[]'::jsonb)`;
}
