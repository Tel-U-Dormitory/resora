// Explicit application scope. Review this list whenever migrations add objects.
export const tables = [
	"account",
	"account_audit_logs",
	"attendance_audit_logs",
	"attendance_records",
	"attendance_sessions",
	"buildings",
	"departments",
	"event_audit_logs",
	"event_deletion_audits",
	"event_participants",
	"events",
	"positions",
	"qr_challenges",
	"rate_limit",
	"session",
	"sr_profiles",
	"system_privileges",
	"user",
	"user_profiles",
	"verification",
].map((name) => `public.${name}`);
tables.push("drizzle.__drizzle_migrations");
tables.sort();

export const functions = [
	"check_internal_event_session",
	"check_sr_identity_consistency",
	"guard_account_audit_mutation",
	"guard_attendance_audit_append_only",
	"guard_attendance_audit_binding",
	"guard_attendance_record_origin",
	"guard_event_audit_mutation",
	"guard_internal_session_binding",
];

export const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
export const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
export const qualified = (value: string) =>
	value.split(".").map(identifier).join(".");
const scope = "n.nspname IN ('public', 'drizzle')";

// PostgreSQL flattens associative AND groups when reparsing this existing CHECK
// during pg_dump/restore. Normalize only these two exact equivalent deparser
// forms, not arbitrary parentheses (which could hide a changed constraint).
const coordinateCheckForms = [
	"CHECK ((((center_lat >= ('-90'::integer)::double precision) AND (center_lat <= (90)::double precision)) AND ((center_lng >= ('-180'::integer)::double precision) AND (center_lng <= (180)::double precision))))",
	"CHECK (((center_lat >= ('-90'::integer)::double precision) AND (center_lat <= (90)::double precision) AND ((center_lng >= ('-180'::integer)::double precision) AND (center_lng <= (180)::double precision))))",
];
const constraintDefinition = `CASE WHEN n.nspname='public' AND c.relname='attendance_sessions' AND k.conname='attendance_sessions_coordinates'
 AND pg_get_constraintdef(k.oid) IN (${coordinateCheckForms.map(literal).join(",")}) THEN 'coordinate-check-equivalent-v1' ELSE pg_get_constraintdef(k.oid) END`;

// No OIDs, owners or ACLs: these differ between primary and standby by design.
export const fingerprintSql = `SELECT md5(COALESCE(jsonb_agg(item ORDER BY item::text), '[]'::jsonb)::text) AS fingerprint FROM (
 SELECT jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity) item
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND c.relkind IN ('r','p','S','v','m','f','c')
 UNION ALL
 SELECT jsonb_build_array('column',n.nspname,c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE ${scope} AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT jsonb_build_array('constraint',n.nspname,c.relname,k.conname,k.contype,k.convalidated,${constraintDefinition})
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope}
 UNION ALL
 SELECT jsonb_build_array('index',n.nspname,c.relname,pg_get_indexdef(c.oid))
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND c.relkind='i'
 UNION ALL
 SELECT jsonb_build_array('function',n.nspname,p.proname,pg_get_functiondef(p.oid))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${scope} AND p.prokind='f'
 UNION ALL
 SELECT jsonb_build_array('trigger',n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid))
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND NOT t.tgisinternal
 UNION ALL
 SELECT jsonb_build_array('enum',n.nspname,t.typname,e.enumsortorder,e.enumlabel)
 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE ${scope}
 UNION ALL
 SELECT jsonb_build_array('sequence',n.nspname,c.relname,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle)
 FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope}
) objects`;

// Hash rows inside PostgreSQL; application records never enter process output.
export const countsSql = `SELECT * FROM (${tables
	.map(
		(table) => `SELECT ${literal(table)} AS name, count(*)::text AS count,
 md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS digest FROM ${qualified(table)} t`,
	)
	.join(" UNION ALL ")}) counted ORDER BY name`;

export const inventorySql = `SELECT n.nspname || '.' || c.relname AS name
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE ${scope} AND c.relkind IN ('r','p','S','v','m','f','c') ORDER BY 1`;

export const integritySql = `DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.user_profiles p LEFT JOIN public.sr_profiles s ON s.user_id=p.user_id LEFT JOIN public."user" u ON u.id=p.user_id
 WHERE (p.actor='SR') IS DISTINCT FROM (s.user_id IS NOT NULL) OR (p.actor='SR' AND (u.username IS NULL OR length(btrim(u.username))=0))) THEN
 RAISE EXCEPTION 'STANDBY_IDENTITY_INTEGRITY'; END IF;
 IF EXISTS (SELECT 1 FROM public.events e LEFT JOIN public.attendance_sessions s ON s.internal_event_id=e.id WHERE s.id IS NULL) THEN
 RAISE EXCEPTION 'STANDBY_EVENT_SESSION_INTEGRITY'; END IF;
 IF EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname IN ('public','drizzle') AND NOT k.convalidated) THEN
 RAISE EXCEPTION 'STANDBY_UNVALIDATED_CONSTRAINT'; END IF;
 IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled<>'O') THEN
 RAISE EXCEPTION 'STANDBY_DISABLED_TRIGGER'; END IF;
 IF (SELECT CASE WHEN is_called THEN last_value < COALESCE((SELECT max(id) FROM drizzle.__drizzle_migrations),0)
 ELSE last_value <= COALESCE((SELECT max(id) FROM drizzle.__drizzle_migrations),0) END FROM drizzle.__drizzle_migrations_id_seq) THEN
 RAISE EXCEPTION 'STANDBY_SEQUENCE_BEHIND'; END IF;
 IF EXISTS (SELECT 1 FROM pg_sequence WHERE seqrelid='drizzle.__drizzle_migrations_id_seq'::regclass AND (seqincrement<>1 OR seqcycle)) THEN
 RAISE EXCEPTION 'STANDBY_UNSUPPORTED_SEQUENCE'; END IF;
 END $$`;

export const restoreLock = "hashtextextended('resora:standby-restore', 0)";

export function fenceSql(appRole: string) {
	return `DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${literal(appRole)} AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls) THEN
 RAISE EXCEPTION 'STANDBY_APP_ROLE_MUST_BE_NOLOGIN'; END IF;
 IF current_user=${literal(appRole)} THEN RAISE EXCEPTION 'STANDBY_SEPARATE_OPERATOR_REQUIRED'; END IF;
 IF EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname=${literal(appRole)})) THEN
 RAISE EXCEPTION 'STANDBY_APP_ROLE_MEMBERSHIPS_PRESENT'; END IF;
 IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND usename=${literal(appRole)} AND pid<>pg_backend_pid()) THEN
 RAISE EXCEPTION 'STANDBY_APP_CONNECTIONS_PRESENT'; END IF;
 END $$`;
}
