import { randomInt } from "node:crypto";
import { type AuthConfig, createAuth } from "@resora/auth";
import type { Database, DatabaseTransaction } from "@resora/db";
import { account, user } from "@resora/db/schema/auth";
import {
	buildings,
	departments,
	positions,
	srProfiles,
	userProfiles,
} from "@resora/db/schema/identity";
import { eq, inArray, or, sql } from "drizzle-orm";

import {
	type CredentialBundle,
	type InitialCredential,
	prepareCredentials,
} from "./provisioning-credentials";
import {
	ProvisioningError,
	parseSrCsv,
	type SrImportRow,
} from "./provisioning-csv";
import { createSrAccount } from "./sr-account";

type Source = Database | DatabaseTransaction;
const temporaryPasswordAlphabet =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export type ProvisioningResult = {
	mode: "dry-run" | "apply";
	created: number;
	unchanged: number;
	credentialsFile?: string;
};
export type ProvisioningOptions = {
	db: Database;
	authConfig: AuthConfig;
	csv: string;
	mode: "dry-run" | "apply";
	projectRoot: string;
	// Test seam for database/filesystem failure recovery; not exposed as a CLI flag.
	prepareOutput?: (
		records: readonly InitialCredential[],
	) => Promise<CredentialBundle>;
};

export function localProvisioningTarget(value: string | undefined): string {
	let target: URL;
	try {
		if (!value) throw new Error();
		target = new URL(value);
	} catch {
		throw new ProvisioningError("LOCAL_SCRATCH_TARGET_REQUIRED");
	}
	if (
		!["postgres:", "postgresql:"].includes(target.protocol) ||
		!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
		!/^\/resora_identity_test_[a-z0-9_]+$/.test(target.pathname) ||
		target.search ||
		target.hash
	)
		throw new ProvisioningError("LOCAL_SCRATCH_TARGET_REQUIRED");
	return target.toString();
}

export async function verifyLocalProvisioningDatabase(
	db: Database,
	url: string,
) {
	const target = new URL(localProvisioningTarget(url));
	const result = await db.execute<{
		name: string;
		host: string;
		port: number;
	}>(sql`
		SELECT current_database() AS name, host(inet_server_addr()) AS host, inet_server_port() AS port
	`);
	const actual = result.rows[0];
	if (
		!actual ||
		actual.name !== target.pathname.slice(1) ||
		!["127.0.0.1", "::1"].includes(actual.host) ||
		actual.port !== Number(target.port || 5432)
	)
		throw new ProvisioningError("LOCAL_SCRATCH_TARGET_MISMATCH");
}

async function plan(db: Source, rows: readonly SrImportRow[], lock: boolean) {
	const departmentQuery = db
		.select()
		.from(departments)
		.where(
			inArray(
				departments.code,
				rows.map((row) => row.department),
			),
		);
	const positionQuery = db
		.select()
		.from(positions)
		.where(
			inArray(
				positions.code,
				rows.map((row) => row.position),
			),
		);
	const buildingQuery = db
		.select()
		.from(buildings)
		.where(
			inArray(
				buildings.code,
				rows.map((row) => row.building),
			),
		);
	// A transaction uses one pg client; do not queue concurrent queries on it.
	const departmentRows = await (lock
		? departmentQuery.for("share")
		: departmentQuery);
	const positionRows = await (lock
		? positionQuery.for("share")
		: positionQuery);
	const buildingRows = await (lock
		? buildingQuery.for("share")
		: buildingQuery);
	const departmentMap = new Map(departmentRows.map((row) => [row.code, row]));
	const positionMap = new Map(positionRows.map((row) => [row.code, row]));
	const buildingMap = new Map(buildingRows.map((row) => [row.code, row]));
	const existing = await db
		.select({
			id: user.id,
			nim: user.username,
			name: user.name,
			email: user.email,
			actor: userProfiles.actor,
			isActive: userProfiles.isActive,
			department: srProfiles.departmentCode,
			position: srProfiles.positionCode,
			buildingId: srProfiles.buildingId,
		})
		.from(user)
		.leftJoin(userProfiles, eq(userProfiles.userId, user.id))
		.leftJoin(srProfiles, eq(srProfiles.userId, user.id))
		.where(
			or(
				inArray(
					user.username,
					rows.map((row) => row.nim),
				),
				inArray(
					sql`lower(${user.email})`,
					rows.map((row) => row.email),
				),
			),
		);
	const credentials = existing.length
		? await db
				.select({ userId: account.userId })
				.from(account)
				.where(
					sql`${account.providerId} = 'credential' AND ${account.password} IS NOT NULL AND ${inArray(
						account.userId,
						existing.map((row) => row.id),
					)}`,
				)
		: [];
	const credentialUsers = new Set(credentials.map((row) => row.userId));
	const candidates = [];
	let unchanged = 0;
	for (const row of rows) {
		const department = departmentMap.get(row.department);
		const position = positionMap.get(row.position);
		const building = buildingMap.get(row.building);
		if (!department || !position || !building)
			throw new ProvisioningError("UNKNOWN_ORGANIZATION_REFERENCE", row.record);
		if (!department.isActive || !position.isActive || !building.isActive)
			throw new ProvisioningError(
				"INACTIVE_ORGANIZATION_REFERENCE",
				row.record,
			);
		const matches = existing.filter(
			(current) =>
				current.nim === row.nim || current.email.toLowerCase() === row.email,
		);
		if (matches.length) {
			const current = matches[0];
			if (
				matches.length !== 1 ||
				!current ||
				current.nim !== row.nim ||
				current.email.toLowerCase() !== row.email ||
				current.name !== row.name ||
				current.actor !== "SR" ||
				current.isActive !== row.is_active ||
				current.department !== row.department ||
				current.position !== row.position ||
				current.buildingId !== building.id ||
				!credentialUsers.has(current.id)
			)
				throw new ProvisioningError("EXISTING_ACCOUNT_CONFLICT", row.record);
			unchanged++;
		} else candidates.push({ row, buildingId: building.id });
	}
	return { candidates, unchanged };
}

export async function provisionSrAccounts(
	options: ProvisioningOptions,
): Promise<ProvisioningResult> {
	const rows = parseSrCsv(options.csv);
	let bundle: CredentialBundle | undefined;
	let attemptingCommit = false;
	try {
		if (options.mode === "dry-run") {
			return await options.db.transaction(
				async (tx) => {
					const preview = await plan(tx, rows, false);
					return {
						mode: "dry-run",
						created: preview.candidates.length,
						unchanged: preview.unchanged,
					};
				},
				{ accessMode: "read only", isolationLevel: "repeatable read" },
			);
		}
		const result = await options.db.transaction(async (tx) => {
			// Serialize this provisioner's concurrent imports; DB uniqueness also rejects external races.
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(hashtext('resora:sr-csv-provisioning'))`,
			);
			const preview = await plan(tx, rows, true);
			if (!preview.candidates.length)
				return {
					mode: "apply" as const,
					created: 0,
					unchanged: preview.unchanged,
				};
			const context = await createAuth(options.authConfig, tx).$context;
			const passwords = new Set<string>();
			const entries = [];
			for (const candidate of preview.candidates) {
				let password: string;
				do {
					password = Array.from({ length: 8 }, () =>
						temporaryPasswordAlphabet.charAt(
							randomInt(temporaryPasswordAlphabet.length),
						),
					).join("");
				} while (passwords.has(password));
				passwords.add(password);
				entries.push({
					...candidate,
					password,
					hash: await context.password.hash(password),
				});
			}
			// Persist all secrets BEFORE any new account writes; failure cannot leave usable accounts.
			const output = entries.map(({ row, password }) => ({
				nim: row.nim,
				name: row.name,
				email: row.email,
				temporary_password: password,
			}));
			bundle = await (
				options.prepareOutput ??
				((records) => prepareCredentials(options.projectRoot, records))
			)(output);
			for (const { row, buildingId, hash } of entries) {
				await createSrAccount(
					tx,
					context,
					{
						name: row.name,
						email: row.email,
						nim: row.nim,
						isActive: row.is_active,
						departmentCode: row.department,
						positionCode: row.position,
						buildingId,
					},
					hash,
					"sr-csv",
				);
			}
			// Flush existing deferred identity constraints before reporting readiness for commit.
			await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
			attemptingCommit = true;
			return {
				mode: "apply" as const,
				created: entries.length,
				unchanged: preview.unchanged,
				credentialsFile: bundle.path,
			};
		});
		await bundle?.mark("COMMITTED");
		return result;
	} catch (error) {
		await bundle
			?.mark(attemptingCommit ? "UNCONFIRMED" : "FAILED")
			.catch(() => {});
		if (attemptingCommit)
			throw new ProvisioningError(
				"IMPORT_OUTCOME_UNCONFIRMED_CHECK_PRIVATE_EXPORT",
			);
		if (error instanceof ProvisioningError) throw error;
		if (
			error instanceof Error &&
			error.message === "AUTH_ACCOUNT_CREATION_FAILED"
		)
			throw new ProvisioningError("AUTH_ACCOUNT_CREATION_FAILED");
		throw new ProvisioningError("PROVISIONING_FAILED_NO_ACCOUNTS_COMMITTED");
	}
}
