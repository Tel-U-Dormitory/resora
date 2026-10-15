import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac, randomBytes } from "node:crypto";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApp } from "../../../apps/server/src/app";
import { eventDraftSchema } from "../../api/src/modules/attendance/attendance.schema";
import * as attendance from "../../api/src/modules/attendance/attendance.service";
import { checkIn } from "../../api/src/modules/attendance/check-in";
import { manualCorrect } from "../../api/src/modules/attendance/manual-attendance";
import { signChallenge } from "../../api/src/modules/attendance/qr";
import { createAuth } from "../../auth/src/index";
import { getActiveSr } from "../../auth/src/sr-access";
import { createDb } from "../src/index";
import { seedOrganization } from "../src/organization";
import { backup, reconcile, restore, validateConfig } from "./standby";

// Explicit opt-in only. Both databases must be newly provisioned scratch targets.
const file = process.env.RESORA_STANDBY_TEST_CONFIG;
(file ? describe : describe.skip)(
	"native backup/restore on disposable PostgreSQL 17",
	() => {
		if (!file) return;
		const config = validateConfig(JSON.parse(readFileSync(file, "utf8")));
		if (config.standby.mode !== "local-test")
			throw new Error("LOCAL_SCRATCH_CONFIG_REQUIRED");
		const source = createDb({ DATABASE_URL: config.source.url });
		const target = createDb({ DATABASE_URL: config.standby.url });
		const secret = randomBytes(32).toString("hex");
		const password = randomBytes(24).toString("hex");
		const originalPath = process.env.PATH;
		let first = "";
		let second = "";
		let third = "";
		let faultDirectory = "";
		let originalPsql = "";
		const marker = async () =>
			(
				await target.$client.query(
					'SELECT name FROM public."user" WHERE id=$1',
					["synthetic-phase3-hco"],
				)
			).rows[0].name;
		const sequence = async () =>
			(
				await target.$client.query(
					"SELECT last_value::text AS value FROM drizzle.__drizzle_migrations_id_seq",
				)
			).rows[0].value;
		const sentinel = async () => {
			const adminUrl = new URL(config.source.url);
			adminUrl.pathname = new URL(config.standby.url).pathname;
			const admin = createDb({ DATABASE_URL: adminUrl.href });
			try {
				return (
					await admin.$client.query(
						"SELECT marker FROM storage.phase3_sentinel",
					)
				).rows[0].marker;
			} finally {
				await admin.$client.end();
			}
		};
		const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
		function reseal(path: string, value: unknown) {
			const payload = JSON.stringify(value);
			const signature = createHmac("sha256", readFileSync(config.keyFile))
				.update(payload)
				.digest("hex");
			writeFileSync(path, JSON.stringify({ payload, signature }), {
				mode: 0o600,
			});
		}
		function fault(sql: string) {
			if (!faultDirectory || !originalPsql)
				throw new Error("FAULT_FIXTURE_NOT_READY");
			writeFileSync(join(faultDirectory, "fault.sql"), sql, { mode: 0o600 });
			writeFileSync(
				join(faultDirectory, "psql"),
				`#!/bin/sh\nif [ "$1" != "--version" ]; then set -- "$@" ${quote(`--file=${join(faultDirectory, "fault.sql")}`)}; fi\nexec ${quote(originalPsql)} "$@"\n`,
				{ mode: 0o700 },
			);
			process.env.PATH = `${faultDirectory}:${originalPath}`;
		}
		beforeAll(async () => {
			for (const db of [source, target])
				expect(
					(
						await db.$client.query(
							"SELECT count(*)::int AS n FROM pg_tables WHERE schemaname IN ('public','drizzle')",
						)
					).rows[0].n,
				).toBe(0);
			await migrate(source, {
				migrationsFolder: fileURLToPath(
					new URL("../src/migrations", import.meta.url),
				),
			});
			await seedOrganization(source);
			const auth = createAuth(
				{
					BETTER_AUTH_URL: "http://localhost:3000",
					BETTER_AUTH_SECRET: secret,
					CORS_ORIGIN: "http://localhost:3001",
					NODE_ENV: "test",
				},
				source,
			);
			const hashed = await (await auth.$context).password.hash(password);
			const client = await source.$client.connect();
			try {
				await client.query("BEGIN");
				await client.query(
					'INSERT INTO public."user" (id,name,email,username,created_at,updated_at) VALUES ($1,$2,$3,$4,now(),now())',
					[
						"synthetic-phase3-hco",
						"version-one",
						"phase3@example.invalid",
						"0000000003",
					],
				);
				await client.query(
					"INSERT INTO public.account (id,user_id,account_id,provider_id,password,created_at,updated_at) VALUES ($1,$1,$1,'credential',$2,now(),now())",
					["synthetic-phase3-hco", hashed],
				);
				await client.query(
					"INSERT INTO public.user_profiles (user_id,actor,is_active,must_change_password) VALUES ($1,'SR',true,false)",
					["synthetic-phase3-hco"],
				);
				await client.query(
					"INSERT INTO public.sr_profiles (user_id,department_code,position_code,building_id) SELECT $1,'HCO','KADEP',id FROM public.buildings WHERE code='A'",
					["synthetic-phase3-hco"],
				);
				await client.query("COMMIT");
			} finally {
				client.release();
			}
			const operator = await getActiveSr(source, "synthetic-phase3-hco");
			if (!operator) throw new Error("SYNTHETIC_IDENTITY_MISSING");
			const { eventId } = await attendance.createEvent(
				source,
				operator,
				eventDraftSchema.parse({
					title: "Synthetic standby event",
					startsAt: new Date(Date.now() - 60_000).toISOString(),
					endsAt: new Date(Date.now() + 3_600_000).toISOString(),
					rosterCriteria: { allSr: true },
					session: { centerLat: 0, centerLng: 0 },
				}),
			);
			await attendance.publishEvent(source, operator, eventId);
			await attendance.activateSession(source, operator, eventId);
			const challenge = (
				await source.$client.query(
					"SELECT q.id,q.session_id FROM public.qr_challenges q JOIN public.attendance_sessions s ON s.id=q.session_id WHERE s.internal_event_id=$1",
					[eventId],
				)
			).rows[0];
			await checkIn(source, operator, secret, {
				qrToken: signChallenge(secret, challenge.session_id, challenge.id),
				location: { latitude: 0, longitude: 0, accuracyMeters: 5 },
			});
			const attendanceId = (
				await source.$client.query("SELECT id FROM public.attendance_records")
			).rows[0].id;
			for (const offset of [30_000, 20_000])
				await manualCorrect(source, operator, {
					attendanceId,
					attendanceAt: new Date(Date.now() - offset).toISOString(),
					reason: "Synthetic historical correction",
				});
			await attendance.closeEvent(source, operator, eventId);
			await source.$client.query(
				"SELECT setval('drizzle.__drizzle_migrations_id_seq',100,true)",
			);
			originalPsql = Bun.which("psql") ?? "";
			if (!originalPsql) throw new Error("POSTGRESQL_CLIENTS_REQUIRED");
		}, 60_000);
		afterAll(async () => {
			process.env.PATH = originalPath;
			if (faultDirectory)
				rmSync(faultDirectory, { recursive: true, force: true });
			await source.$client.end();
			await target.$client.end();
		});
		test("custom snapshot restores data, audit history and objects to empty non-superuser standby", async () => {
			first = await backup(config);
			expect(await restore(config, first)).toBe("verified");
			expect(await marker()).toBe("version-one");
			expect(await sequence()).toBe("100");
			expect(
				(
					await target.$client.query(
						"SELECT count(*)::int AS n FROM public.attendance_audit_logs",
					)
				).rows[0].n,
			).toBe(2);
			expect(await sentinel()).toBe("managed-must-survive");
			expect(
				(
					await target.$client.query(
						"SELECT has_table_privilege('anon','public.account','SELECT') AS allowed",
					)
				).rows[0].allowed,
			).toBe(false);
			expect(
				(
					await target.$client.query(
						"SELECT rolsuper FROM pg_roles WHERE rolname=current_user",
					)
				).rows[0].rolsuper,
			).toBe(false);
		}, 60_000);
		test("a newer snapshot replaces existing data and sequences without deleting managed objects", async () => {
			await source.$client.query(
				'UPDATE public."user" SET name=$1 WHERE id=$2',
				["version-two", "synthetic-phase3-hco"],
			);
			await source.$client.query(
				"SELECT setval('drizzle.__drizzle_migrations_id_seq',200,true)",
			);
			second = await backup(config);
			expect(await restore(config, second)).toBe("verified");
			expect(await marker()).toBe("version-two");
			expect(await sequence()).toBe("200");
			expect(await sentinel()).toBe("managed-must-survive");
		}, 60_000);
		test("checksum rejects corrupted input before standby mutation", async () => {
			const path = join(config.directory, `${second}.dump`);
			const original = readFileSync(path);
			try {
				writeFileSync(path, Buffer.from("synthetic-corrupt-archive"));
				await expect(restore(config, second)).rejects.toThrow(
					"SNAPSHOT_VERIFICATION_FAILED",
				);
				expect(await marker()).toBe("version-two");
			} finally {
				writeFileSync(path, original);
			}
		}, 60_000);
		test("late SQL failure rolls back restored rows, schema and recreated sequence", async () => {
			await source.$client.query(
				'UPDATE public."user" SET name=$1 WHERE id=$2',
				["version-three", "synthetic-phase3-hco"],
			);
			await source.$client.query(
				"SELECT setval('drizzle.__drizzle_migrations_id_seq',300,true)",
			);
			third = await backup(config);
			faultDirectory = mkdtempSync(join(config.directory, ".fault-"));
			fault("SELECT 1/0;");
			try {
				await expect(restore(config, third)).rejects.toThrow(
					"PREVIOUS_DATA_PRESERVED",
				);
			} finally {
				process.env.PATH = originalPath;
			}
			expect(await marker()).toBe("version-two");
			expect(await sequence()).toBe("200");
			expect(await reconcile(config)).toBe("rolled-back");
			expect(await sentinel()).toBe("managed-must-survive");
		}, 60_000);
		test("validation failure before commit retains the previous verified data", async () => {
			const path = join(config.directory, `${third}.json`);
			const original = readFileSync(path);
			const payload = JSON.parse(JSON.parse(original.toString("utf8")).payload);
			payload.rows.find(
				(row: { name: string }) => row.name === "public.user",
			).digest = "0".repeat(32);
			reseal(path, payload);
			try {
				await expect(restore(config, third)).rejects.toThrow(
					"STANDBY_DATA_MISMATCH",
				);
			} finally {
				writeFileSync(path, original);
			}
			expect(await marker()).toBe("version-two");
			expect(await sequence()).toBe("200");
			expect(await reconcile(config)).toBe("rolled-back");
		}, 60_000);
		test("backend termination during restore preserves the last verified standby and allows retry", async () => {
			fault("SELECT pg_sleep(30);");
			const operation = restore(config, third).then(
				() => "unexpected-success",
				() => "interrupted",
			);
			try {
				let terminated = false;
				for (let attempt = 0; attempt < 100; attempt++) {
					const active = (
						await target.$client.query(
							"SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND application_name='resora-standby-restore' AND query LIKE '%pg_sleep%' AND pid<>pg_backend_pid()",
						)
					).rows[0];
					if (active) {
						await expect(restore(config, third)).rejects.toThrow(
							"RESTORE_RUNNER_LOCKED",
						);
						await target.$client.query("SELECT pg_terminate_backend($1)", [
							active.pid,
						]);
						terminated = true;
						break;
					}
					await Bun.sleep(50);
				}
				expect(terminated).toBe(true);
				expect(await operation).toBe("interrupted");
			} finally {
				process.env.PATH = originalPath;
			}
			expect(await marker()).toBe("version-two");
			expect(await sequence()).toBe("200");
			expect(await reconcile(config)).toBe("rolled-back");
			expect(await restore(config, third)).toBe("verified");
			expect(await marker()).toBe("version-three");
		}, 60_000);
		test("an unresolved journal blocks another restore until explicit reconciliation", async () => {
			const name = readdirSync(config.directory).find((name) =>
				/^standby-.*\.json$/.test(name),
			);
			if (!name) throw new Error("LOCAL_JOURNAL_REQUIRED");
			const path = join(config.directory, name);
			const state = JSON.parse(JSON.parse(readFileSync(path, "utf8")).payload);
			reseal(path, { ...state, status: "running" });
			await expect(restore(config, third)).rejects.toThrow(
				"RECONCILE_PREVIOUS_RESTORE_FIRST",
			);
			expect(await reconcile(config)).toBe("verified");
			expect(await marker()).toBe("version-three");
		}, 60_000);
		test("manual local promotion supports existing backend; active app role blocks later refresh", async () => {
			const adminUrl = new URL(config.source.url);
			adminUrl.pathname = new URL(config.standby.url).pathname;
			const admin = createDb({ DATABASE_URL: adminUrl.href });
			const appUrl = new URL(config.standby.url);
			appUrl.username = config.standby.appRole;
			appUrl.password = password;
			const appDb = createDb({ DATABASE_URL: appUrl.href });
			let server:
				| ReturnType<ReturnType<typeof createApp>["listen"]>
				| undefined;
			try {
				// Synthetic local role only; no real cutover or remote role mutation.
				await admin.$client.query(
					`ALTER ROLE "${config.standby.appRole}" LOGIN PASSWORD '${password}'`,
				);
				const auth = createAuth(
					{
						BETTER_AUTH_URL: "http://localhost:3000",
						BETTER_AUTH_SECRET: secret,
						CORS_ORIGIN: "http://localhost:3001",
						NODE_ENV: "test",
					},
					appDb,
				);
				const login = await auth.handler(
					new Request("http://localhost:3000/api/auth/sign-in/username", {
						method: "POST",
						headers: {
							origin: "http://localhost:3001",
							"content-type": "application/json",
							"x-resora-client-ip": "192.0.2.3",
						},
						body: JSON.stringify({ username: "0000000003", password }),
					}),
				);
				expect(login.status).toBe(200);
				const cookie = login.headers
					.getSetCookie()
					.map((v) => v.split(";")[0])
					.join("; ");
				const listener = createApp(
					{ db: appDb, auth },
					"http://localhost:3001",
				).listen(0, "127.0.0.1");
				server = listener;
				await new Promise<void>((resolve) =>
					listener.once("listening", resolve),
				);
				const address = server.address();
				if (!address || typeof address === "string")
					throw new Error("LOCAL_LISTENER_REQUIRED");
				const base = `http://127.0.0.1:${address.port}`;
				expect((await fetch(`${base}/readyz`)).status).toBe(200);
				expect(
					(await fetch(`${base}/trpc/privateData`, { headers: { cookie } }))
						.status,
				).toBe(200);
				const operator = await getActiveSr(appDb, "synthetic-phase3-hco");
				if (!operator) throw new Error("RESTORED_IDENTITY_REQUIRED");
				const record = (
					await appDb.$client.query(
						"SELECT id,attendance_at FROM public.attendance_records LIMIT 1",
					)
				).rows[0];
				await manualCorrect(appDb, operator, {
					attendanceId: record.id,
					attendanceAt: new Date(
						record.attendance_at.getTime() - 1000,
					).toISOString(),
					reason: "Synthetic post-cutover correction",
				});
				expect(
					(
						await appDb.$client.query(
							"SELECT count(*)::int AS n FROM public.attendance_audit_logs",
						)
					).rows[0].n,
				).toBe(3);
				await expect(restore(config, third)).rejects.toThrow(
					"STANDBY_APP_ROLE_MUST_BE_NOLOGIN",
				);
			} finally {
				const listener = server;
				if (listener)
					await new Promise<void>((resolve) => listener.close(() => resolve()));
				await appDb.$client.end();
				await admin.$client.query(
					`ALTER ROLE "${config.standby.appRole}" NOLOGIN`,
				);
				await admin.$client.end();
			}
		}, 60_000);
	},
);
