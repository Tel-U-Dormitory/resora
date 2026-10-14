import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type AuthConfig, createAuth } from "@resora/auth";
import type { Database } from "@resora/db";
import { user } from "@resora/db/schema/auth";
import {
	accountAuditLogs,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
	type CredentialBundle,
	type InitialSystemCredential,
	prepareCredentials,
} from "./provisioning-credentials";
import { localProvisioningTarget } from "./sr-provisioning";

export const systemAdminInputSchema = z
	.object({
		username: z
			.string()
			.trim()
			.min(3)
			.max(30)
			.regex(/^[A-Za-z][A-Za-z0-9_.]+$/),
		name: z.string().trim().min(1).max(200),
		email: z
			.string()
			.trim()
			.pipe(z.email())
			.transform((value) => value.toLowerCase()),
	})
	.strict();

export class BootstrapError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

export type BootstrapTarget = {
	mode: "local" | "production";
	url: string;
	database: string;
	reference?: string;
};

export function validateBootstrapTarget(target: BootstrapTarget) {
	let parsed: URL;
	try {
		parsed = new URL(target.url);
	} catch {
		throw new BootstrapError("EXPLICIT_TARGET_REQUIRED");
	}
	if (target.mode === "local") {
		localProvisioningTarget(target.url);
		if (parsed.pathname.slice(1) !== target.database)
			throw new BootstrapError("LOCAL_TARGET_MISMATCH");
	} else {
		const ref = target.reference;
		if (
			!ref ||
			!/^[a-z]{20}$/.test(ref) ||
			target.database !== "postgres" ||
			parsed.pathname !== "/postgres" ||
			parsed.port !== "5432" ||
			!["postgres:", "postgresql:"].includes(parsed.protocol) ||
			parsed.search ||
			parsed.hash
		)
			throw new BootstrapError(
				"EXPLICIT_PRODUCTION_DIRECT_OR_SESSION_TARGET_REQUIRED",
			);
		const direct =
			parsed.hostname === `db.${ref}.supabase.co` &&
			parsed.username === "postgres";
		const session =
			/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(parsed.hostname) &&
			parsed.username === `postgres.${ref}`;
		if (!direct && !session)
			throw new BootstrapError("PRODUCTION_PROJECT_MISMATCH");
	}
	return parsed;
}

export async function verifyBootstrapDatabase(
	db: Database,
	target: BootstrapTarget,
	projectRoot: string,
) {
	const parsed = validateBootstrapTarget(target);
	const result = await db.execute<{
		name: string;
		role: string;
		host: string;
		port: number;
	}>(
		sql`SELECT current_database() AS name, current_user AS role, host(inet_server_addr()) AS host, inet_server_port() AS port`,
	);
	const actual = result.rows[0];
	if (!actual || actual.name !== target.database)
		throw new BootstrapError("DATABASE_IDENTITY_MISMATCH");
	if (
		target.mode === "local" &&
		(!["127.0.0.1", "::1"].includes(actual.host) ||
			actual.port !== Number(parsed.port || 5432) ||
			actual.role !== decodeURIComponent(parsed.username))
	)
		throw new BootstrapError("LOCAL_DATABASE_IDENTITY_MISMATCH");
	if (target.mode === "production" && actual.role !== "postgres")
		throw new BootstrapError("PRODUCTION_MIGRATION_ROLE_REQUIRED");
	if (target.mode === "production") {
		const tls = await db.execute<{ ssl: boolean }>(
			sql`SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()`,
		);
		if (!tls.rows[0]?.ssl) throw new BootstrapError("PRODUCTION_TLS_REQUIRED");
	}
	const root = join(projectRoot, "packages/db/src/migrations");
	const folders = (await readdir(root))
		.filter((name) => /^\d{14}_/.test(name))
		.sort();
	const hashes: string[] = [];
	for (const folder of folders)
		hashes.push(
			createHash("sha256")
				.update(await readFile(join(root, folder, "migration.sql"), "utf8"))
				.digest("hex"),
		);
	const history = await db.execute<{ hash: string }>(
		sql`SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id`,
	);
	if (
		history.rows.length !== hashes.length ||
		history.rows.some((row, index) => row.hash !== hashes[index])
	)
		throw new BootstrapError("MIGRATION_HISTORY_MISMATCH");
	const schema = await db.execute<{ ready: boolean }>(sql`
		SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='actor_type' AND e.enumlabel='SYSTEM_ADMIN')
		AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.account_audit_logs'::regclass AND attname='actor_user_id' AND NOT attnotnull AND NOT attisdropped)
		AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.account_audit_logs'::regclass AND conname='account_audit_logs_action_check' AND convalidated AND pg_get_constraintdef(oid) LIKE '%SYSTEM_ADMIN_BOOTSTRAPPED%') AS ready
	`);
	if (!schema.rows[0]?.ready)
		throw new BootstrapError("BOOTSTRAP_SCHEMA_PREREQUISITES_MISMATCH");
}

export async function bootstrapSystemAdmin(options: {
	db: Database;
	authConfig: AuthConfig;
	target: BootstrapTarget;
	projectRoot: string;
	input: z.input<typeof systemAdminInputSchema>;
	mode: "dry-run" | "apply";
	prepareOutput?: (
		records: readonly InitialSystemCredential[],
	) => Promise<CredentialBundle>;
}) {
	const input = systemAdminInputSchema.parse(options.input);
	await verifyBootstrapDatabase(
		options.db,
		options.target,
		options.projectRoot,
	);
	let bundle: CredentialBundle | undefined;
	let attemptingCommit = false;
	try {
		const result = await options.db.transaction(
			async (tx) => {
				if (options.mode === "apply")
					await tx.execute(
						sql`SELECT pg_advisory_xact_lock(hashtext('resora:system-admin-bootstrap'))`,
					);
				const dedicated = await tx
					.select({ userId: userProfiles.userId })
					.from(userProfiles)
					.where(eq(userProfiles.actor, "SYSTEM_ADMIN"));
				if (dedicated.length)
					throw new BootstrapError(
						"DEDICATED_SYSTEM_ADMIN_ALREADY_EXISTS_VERIFY_DO_NOT_RETRY",
					);
				const grants = await tx
					.select({ userId: systemPrivileges.userId })
					.from(systemPrivileges)
					.where(eq(systemPrivileges.privilegeCode, "SUPERADMIN"));
				if (grants.length)
					throw new BootstrapError("EXISTING_SUPERADMIN_GRANT_REQUIRES_REVIEW");
				const conflicts = await tx
					.select({ id: user.id })
					.from(user)
					.where(
						or(
							eq(user.username, input.username),
							eq(sql`lower(${user.email})`, input.email),
						),
					);
				if (conflicts.length)
					throw new BootstrapError("USERNAME_OR_EMAIL_CONFLICT");
				if (options.mode === "dry-run")
					return { mode: "dry-run" as const, created: 0, planned: 1 };
				const context = await createAuth(options.authConfig, tx).$context;
				const password = randomBytes(24).toString("base64url");
				const hash = await context.password.hash(password);
				bundle = await (
					options.prepareOutput ??
					((records) => prepareCredentials(options.projectRoot, records))
				)([{ ...input, temporary_password: password }]);
				const created = await context.internalAdapter.createUser(
					{
						name: input.name,
						email: input.email,
						emailVerified: false,
						username: input.username,
						displayUsername: input.username,
					},
					{ method: "system-admin-bootstrap" },
				);
				if (!created?.id)
					throw new BootstrapError("AUTH_ACCOUNT_CREATION_FAILED");
				const linked = await context.internalAdapter.linkAccount({
					userId: created.id,
					accountId: created.id,
					providerId: "credential",
					password: hash,
				});
				if (!linked?.id)
					throw new BootstrapError("AUTH_ACCOUNT_CREATION_FAILED");
				await tx.insert(userProfiles).values({
					userId: created.id,
					actor: "SYSTEM_ADMIN",
					isActive: true,
					mustChangePassword: true,
				});
				await tx.insert(systemPrivileges).values({
					userId: created.id,
					privilegeCode: "SUPERADMIN",
					grantedByUserId: null,
				});
				await tx.insert(accountAuditLogs).values({
					actorUserId: null,
					targetUserId: created.id,
					action: "SYSTEM_ADMIN_BOOTSTRAPPED",
				});
				await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
				attemptingCommit = true;
				return {
					mode: "apply" as const,
					created: 1,
					planned: 1,
					userId: created.id,
					credentialsFile: bundle.path,
				};
			},
			options.mode === "dry-run"
				? { accessMode: "read only", isolationLevel: "repeatable read" }
				: undefined,
		);
		await bundle?.mark("COMMITTED");
		return result;
	} catch (error) {
		await bundle
			?.mark(attemptingCommit ? "UNCONFIRMED" : "FAILED")
			.catch(() => {});
		if (attemptingCommit)
			throw new BootstrapError(
				"BOOTSTRAP_OUTCOME_UNCONFIRMED_VERIFY_IDENTITY_AND_EXPORT_BEFORE_RETRY",
			);
		if (error instanceof BootstrapError) throw error;
		throw new BootstrapError("BOOTSTRAP_FAILED_NO_ACCOUNT_COMMITTED");
	}
}
