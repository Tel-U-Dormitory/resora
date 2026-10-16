import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Database } from "@resora/db";
import { selectToc } from "@resora/db/archive-scope";
import type { DatabaseConfig } from "@resora/db/config";

const maximumBytes = 128 * 1024 * 1024;
const backupLock = 726583002;
export class DatabaseBackupError extends Error {
	constructor(public readonly code: "BACKUP_BUSY" | "BACKUP_UNAVAILABLE") {
		super(code);
	}
}
export type DownloadBackup = {
	path: string;
	filename: string;
	cleanup: () => Promise<void>;
};

// Only the explicitly selected local primary can be exported through the UI.
// Do not consume DIRECT_DB_URL, PG* overrides or a client-provided target.
export function backupEnvironment(config: DatabaseConfig) {
	const url = new URL(config.DATABASE_URL);
	const localTest =
		["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
		/^\/resora_identity_test_[a-z0-9_]+$/.test(url.pathname);
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		url.search ||
		url.hash ||
		!url.username ||
		!url.password ||
		config.DB_SSL_CA ||
		!(
			localTest ||
			(url.hostname === "postgres" &&
				url.pathname === "/resora" &&
				(!url.port || url.port === "5432"))
		)
	)
		throw new DatabaseBackupError("BACKUP_UNAVAILABLE");
	return {
		PATH: process.env.PATH,
		LANG: "C.UTF-8",
		PGHOST: url.hostname.replace(/^\[|\]$/g, ""),
		PGPORT: url.port || "5432",
		PGDATABASE: url.pathname.slice(1),
		PGUSER: decodeURIComponent(url.username),
		PGPASSWORD: decodeURIComponent(url.password),
		PGSSLMODE: "disable",
		PGCONNECT_TIMEOUT: "10",
		PGAPPNAME: "resora-admin-backup",
		PGTZ: "UTC",
	};
}

async function utility(
	tool: "pg_dump" | "pg_restore",
	args: string[],
	env: ReturnType<typeof backupEnvironment>,
	signal: AbortSignal,
	output?: string,
) {
	const child = spawn(tool, args, {
		env,
		signal,
		killSignal: "SIGKILL",
		stdio: ["ignore", "pipe", "ignore"],
	});
	const completion = new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code) =>
			code === 0
				? resolve()
				: reject(new DatabaseBackupError("BACKUP_UNAVAILABLE")),
		);
	});
	const closed = new Promise<void>((resolve) =>
		child.once("close", () => resolve()),
	);
	let bytes = 0;
	const chunks: Buffer[] = [];
	const bounded = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			bytes += chunk.length;
			if (bytes > (output ? maximumBytes : 1024 * 1024)) {
				callback(new DatabaseBackupError("BACKUP_UNAVAILABLE"));
			} else callback(null, chunk);
		},
	});
	const destination = output
		? createWriteStream(output, { flags: "wx", mode: 0o600 })
		: new Transform({
				transform(chunk: Buffer, _encoding, callback) {
					chunks.push(chunk);
					callback();
				},
			});
	const transfer = pipeline(child.stdout, bounded, destination, { signal });
	try {
		await Promise.all([completion, transfer]);
		return Buffer.concat(chunks).toString("utf8");
	} catch {
		child.kill("SIGKILL");
		await Promise.allSettled([closed, transfer]);
		throw new DatabaseBackupError("BACKUP_UNAVAILABLE");
	}
}

export function databaseBackup(db: Database, config: DatabaseConfig) {
	return async (signal: AbortSignal): Promise<DownloadBackup> => {
		const env = backupEnvironment(config);
		const client = await db.$client.connect();
		const connectionLost = new AbortController();
		client.on("error", () => connectionLost.abort());
		let directory: string | undefined;
		let locked = false;
		let cleaned = false;
		const cleanup = async () => {
			if (cleaned) return;
			cleaned = true;
			try {
				if (directory) await rm(directory, { recursive: true, force: true });
			} finally {
				// Destroy this dedicated connection, releasing its session lock even
				// after an interrupted query. Never return a locked client to the pool.
				client.release(true);
			}
		};
		try {
			const probe = {
				text: `SELECT current_database() AS name, current_setting('server_version_num')::int / 10000 AS version, pg_try_advisory_lock(${backupLock}) AS locked`,
				query_timeout: 10_000,
			};
			const result = await client.query(probe);
			locked = result.rows[0].locked === true;
			if (!locked) throw new DatabaseBackupError("BACKUP_BUSY");
			if (
				result.rows[0].name !== env.PGDATABASE ||
				result.rows[0].version !== 17
			)
				throw new DatabaseBackupError("BACKUP_UNAVAILABLE");
			const deadline = AbortSignal.any([
				signal,
				connectionLost.signal,
				AbortSignal.timeout(10 * 60_000),
			]);
			for (const tool of ["pg_dump", "pg_restore"] as const) {
				if (
					!/\(PostgreSQL\) 17\./.test(
						await utility(tool, ["--version"], env, deadline),
					)
				)
					throw new DatabaseBackupError("BACKUP_UNAVAILABLE");
			}
			directory = await mkdtemp(join(tmpdir(), "resora-backup-"));
			const path = join(directory, "database.dump");
			await utility(
				"pg_dump",
				[
					"--no-password",
					"--format=custom",
					"--schema=public",
					"--schema=drizzle",
					"--strict-names",
					"--no-owner",
					"--no-acl",
					"--no-publications",
					"--no-subscriptions",
					"--lock-wait-timeout=10s",
				],
				env,
				deadline,
				path,
			);
			selectToc(await utility("pg_restore", ["--list", path], env, deadline));
			await utility("pg_restore", [`--file=${devNull}`, path], env, deadline);
			if ((await stat(path)).size === 0)
				throw new DatabaseBackupError("BACKUP_UNAVAILABLE");
			return {
				path,
				filename: `resora-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`,
				cleanup,
			};
		} catch (error) {
			await cleanup();
			throw error instanceof DatabaseBackupError
				? error
				: new DatabaseBackupError("BACKUP_UNAVAILABLE");
		}
	};
}
