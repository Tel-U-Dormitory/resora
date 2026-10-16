import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
	backupEnvironment,
	type DownloadBackup,
	databaseBackup,
} from "../../../apps/server/src/database-backup";
import { selectToc } from "../src/archive-scope";
import { createDb } from "../src/index";

const sourceUrl = process.env.RESORA_BACKUP_TEST_DB_URL;
const targetUrl = process.env.RESORA_BACKUP_RESTORE_TEST_DB_URL;
(sourceUrl && targetUrl ? describe : describe.skip)(
	"download archive with native PostgreSQL tools on fresh disposable databases",
	() => {
		if (!sourceUrl || !targetUrl) return;
		backupEnvironment({ DATABASE_URL: sourceUrl });
		const from = new URL(sourceUrl);
		const to = new URL(targetUrl);
		if (
			from.host !== to.host ||
			from.username !== to.username ||
			from.password !== to.password ||
			to.search ||
			to.hash ||
			!/^\/resora_backup_restore_test_[a-z0-9_]+$/.test(to.pathname)
		)
			throw new Error("MATCHING_LOCAL_SCRATCH_RESTORE_TARGET_REQUIRED");
		const source = createDb({ DATABASE_URL: sourceUrl });
		const target = createDb({ DATABASE_URL: targetUrl });
		const backup = databaseBackup(source, { DATABASE_URL: sourceUrl });
		let file: DownloadBackup | undefined;
		const env = {
			...backupEnvironment({ DATABASE_URL: sourceUrl }),
			PGDATABASE: new URL(targetUrl).pathname.slice(1),
		};
		async function native(tool: string, args: string[]) {
			const child = spawn(tool, args, {
				env,
				stdio: ["ignore", "pipe", "ignore"],
			});
			const output = new Response(child.stdout).text();
			await new Promise<void>((resolve, reject) => {
				child.once("error", reject);
				child.once("close", (code) =>
					code === 0 ? resolve() : reject(new Error("TEST_UTILITY_FAILED")),
				);
			});
			return await output;
		}
		beforeAll(async () => {
			for (const db of [source, target]) {
				expect(
					(
						await db.$client.query(
							"SELECT count(*)::int AS n FROM pg_tables WHERE schemaname IN ('public','drizzle')",
						)
					).rows[0].n,
				).toBe(0);
			}
			await migrate(source, {
				migrationsFolder: join(import.meta.dir, "../src/migrations"),
			});
			await source.$client.query(
				`INSERT INTO public."user" (id,name,email,email_verified,username,display_username,created_at,updated_at) VALUES ('synthetic-download','Synthetic download','download@example.invalid',false,'synthetic.download','synthetic.download',now(),now())`,
			);
			await source.$client.query(
				"SELECT setval('drizzle.__drizzle_migrations_id_seq',200,true)",
			);
		});
		afterAll(async () => {
			await file?.cleanup();
			await source.$client.end();
			await target.$client.end();
		});
		test("complete archive restores application data, metadata, triggers and sequence state without managed objects", async () => {
			file = await backup(new AbortController().signal);
			expect((await readFile(file.path)).subarray(0, 5).toString()).toBe(
				"PGDMP",
			);
			expect((await stat(file.path)).mode & 0o077).toBe(0);
			const toc = await native("pg_restore", ["--list", file.path]);
			expect(toc).toContain("TABLE DATA drizzle __drizzle_migrations");
			expect(toc).not.toContain("TABLE DATA auth ");
			const list = join(file.path, "..", "restore.list");
			await writeFile(list, selectToc(toc), { mode: 0o600 });
			await target.$client.query("CREATE SCHEMA drizzle");
			await native("pg_restore", [
				"--no-password",
				"--single-transaction",
				"--no-owner",
				"--no-acl",
				`--use-list=${list}`,
				`--dbname=${env.PGDATABASE}`,
				file.path,
			]);
			expect(
				(
					await target.$client.query(
						'SELECT name FROM public."user" WHERE id=$1',
						["synthetic-download"],
					)
				).rows[0].name,
			).toBe("Synthetic download");
			expect(
				(
					await target.$client.query(
						"SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
					)
				).rows[0].n,
			).toBe(11);
			expect(
				(
					await target.$client.query(
						"SELECT last_value::int AS n FROM drizzle.__drizzle_migrations_id_seq",
					)
				).rows[0].n,
			).toBe(200);
			expect(
				(
					await target.$client.query(
						"SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)",
					)
				).rows[0].n,
			).toBe(16);
		}, 30_000);
		test("overlapping export is rejected until cleanup releases the lock", async () => {
			await expect(backup(new AbortController().signal)).rejects.toMatchObject({
				code: "BACKUP_BUSY",
			});
			if (!file) throw new Error("FIXTURE_REQUIRED");
			const path = file.path;
			await file.cleanup();
			expect(existsSync(path)).toBe(false);
			file = await backup(new AbortController().signal);
			await file.cleanup();
		}, 30_000);
		test("failed dump and cancelled export release locks without returning an invalid archive", async () => {
			const lock = await source.$client.connect();
			try {
				await lock.query(
					'BEGIN; LOCK TABLE public."user" IN ACCESS EXCLUSIVE MODE',
				);
				const abort = new AbortController();
				const pending = backup(abort.signal);
				setTimeout(() => abort.abort(), 250);
				await expect(pending).rejects.toMatchObject({
					code: "BACKUP_UNAVAILABLE",
				});
			} finally {
				await lock.query("ROLLBACK");
				lock.release();
			}
			file = await backup(new AbortController().signal);
			expect((await stat(file.path)).size).toBeGreaterThan(0);
		}, 30_000);
		test("unavailable source fails without returning an archive", async () => {
			const unavailable = new URL(sourceUrl);
			unavailable.port = "1";
			const db = createDb({ DATABASE_URL: unavailable.href });
			try {
				await expect(
					databaseBackup(db, { DATABASE_URL: unavailable.href })(
						new AbortController().signal,
					),
				).rejects.toBeDefined();
			} finally {
				await db.$client.end();
			}
		});
	},
);
