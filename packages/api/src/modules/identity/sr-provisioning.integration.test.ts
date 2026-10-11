import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { createAuth } from "@resora/auth";
import { createDb, type Database } from "@resora/db";
import { account, user } from "@resora/db/schema/auth";
import {
	buildings,
	departments,
	positions,
	srProfiles,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../../../../apps/server/src/app";
import { prepareCredentials } from "./provisioning-credentials";
import { csvColumns, encodeCsv, readCsv } from "./provisioning-csv";
import {
	localProvisioningTarget,
	type ProvisioningOptions,
	provisionSrAccounts,
	verifyLocalProvisioningDatabase,
} from "./sr-provisioning";

const testUrl = process.env.RESORA_IDENTITY_TEST_DB_URL;
// Await DB work before invoking matchers: Bun's rejects.toThrow can block pg I/O.
async function rejected(operation: Promise<unknown>, code: string) {
	let failure: unknown;
	try {
		await operation;
	} catch (error) {
		failure = error;
	}
	expect(failure instanceof Error && failure.message.includes(code)).toBe(true);
}
(testUrl ? describe : describe.skip)(
	"SR CSV provisioning on disposable local PostgreSQL",
	() => {
		let db: Database;
		let server: Server;
		let base: string;
		let web: ChildProcess | undefined;
		let webFailed = false;
		let webBase: string | undefined;
		const startWeb = async () => {
			if (process.env.RESORA_PROVISION_WEB_SMOKE !== "1") return;
			const reservation = createServer().listen(0, "127.0.0.1");
			await new Promise<void>((done) => reservation.once("listening", done));
			const address = reservation.address();
			if (!address || typeof address === "string")
				throw new Error("Local port unavailable");
			await new Promise<void>((done) => reservation.close(() => done()));
			webBase = `http://127.0.0.1:${address.port}`;
			web = spawn(
				"node",
				[resolve(projectRoot, "apps/web/.next/standalone/apps/web/server.js")],
				{
					cwd: resolve(projectRoot, "apps/web"),
					windowsHide: true,
					stdio: "ignore",
					env: {
						...process.env,
						NODE_ENV: "production",
						HOSTNAME: "127.0.0.1",
						PORT: String(address.port),
						SERVER_URL: base,
						NEXT_TELEMETRY_DISABLED: "1",
					},
				},
			);
			web.on("error", () => {
				webFailed = true;
			});
			for (let attempt = 0; attempt < 100; attempt++) {
				try {
					if ((await fetch(`${webBase}/login`)).ok) return;
				} catch {}
				if (webFailed || typeof web.exitCode === "number")
					throw new Error("Production Next.js unavailable; build first");
				await new Promise((done) => setTimeout(done, 100));
			}
			throw new Error("Production Next.js did not become ready");
		};
		const dashboard = (cookie?: string) => {
			if (!webBase) throw new Error("Local frontend not started");
			return fetch(`${webBase}/dashboard`, {
				redirect: "manual",
				headers: cookie ? { cookie } : {},
			});
		};
		const prefix = `synthetic-provision-${randomUUID()}`;
		const code = `SYN_PROVISION_${randomBytes(5).toString("hex")}`;
		const buildingId = randomUUID();
		const projectRoot = resolve(import.meta.dir, "../../../../..");
		const inputPath = resolve(projectRoot, "tmp", `${prefix}.csv`);
		const cli = async (apply: boolean) => {
			const result = await promisify(execFile)(
				"bun",
				[
					"run",
					"--no-env-file",
					"src/scripts/provision-sr.ts",
					"--input",
					inputPath,
					...(apply ? ["--apply"] : []),
				],
				{
					cwd: resolve(projectRoot, "apps/server"),
					windowsHide: true,
					env: {
						...process.env,
						RESORA_IDENTITY_TEST_DB_URL: localProvisioningTarget(testUrl),
					},
				},
			);
			return result.stdout;
		};
		const config = {
			BETTER_AUTH_URL: "http://127.0.0.1:3000",
			CORS_ORIGIN: "http://localhost:3001",
			BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
		};
		const nims = Array.from(
			{ length: 20 },
			(_, index) => `000${randomBytes(8).toString("hex")}${index}`,
		);
		const inputRow = (index: number, active = true) => [
			nims[index] ?? "",
			"Synthetic SR",
			`${prefix}-${index}@example.invalid`,
			code,
			code,
			code,
			String(active),
		];
		const csv = (...rows: string[][]) =>
			encodeCsv([Array.from(csvColumns), ...rows]);
		const run = (
			input: string,
			mode: "dry-run" | "apply" = "apply",
			prepareOutput?: ProvisioningOptions["prepareOutput"],
		) =>
			provisionSrAccounts({
				db,
				authConfig: config,
				projectRoot,
				csv: input,
				mode,
				prepareOutput,
			});
		const count = async (index: number) =>
			(
				await db
					.select({ id: user.id })
					.from(user)
					.where(eq(user.username, nims[index] ?? ""))
			).length;
		const exported = async (path: string | undefined) => {
			if (!path) throw new Error("Expected private credential export");
			const records = readCsv(await readFile(path, "utf8"));
			expect(records[0]).toEqual([
				"nim",
				"name",
				"email",
				"temporary_password",
			]);
			return records.slice(1);
		};
		const state = async (path: string | undefined) => {
			if (!path) throw new Error("Expected export status");
			return JSON.parse(
				await readFile(resolve(dirname(path), "status.json"), "utf8"),
			) as { state: string; count: number };
		};
		const cookies = (response: Response) =>
			response.headers
				.getSetCookie()
				.map((value) => value.split(";")[0])
				.join("; ");
		let ip = 1;
		let auth: ReturnType<typeof createAuth>;
		const native = (path: string, body: object, cookie?: string) =>
			auth.handler(
				new Request(`${config.BETTER_AUTH_URL}/api/auth/${path}`, {
					method: "POST",
					headers: {
						origin: config.CORS_ORIGIN,
						"content-type": "application/json",
						"x-resora-client-ip": `192.0.2.${ip++}`,
						...(cookie ? { cookie } : {}),
					},
					body: JSON.stringify(body),
				}),
			);
		const rpc = (cookie?: string, path = "privateData") =>
			fetch(`${base}/trpc/${path}`, { headers: cookie ? { cookie } : {} });

		beforeAll(async () => {
			db = createDb({ DATABASE_URL: localProvisioningTarget(testUrl) });
			await verifyLocalProvisioningDatabase(
				db,
				localProvisioningTarget(testUrl),
			);
			await writeFile(inputPath, csv(inputRow(0)), { flag: "wx", mode: 0o600 });
			await db.transaction(async (tx) => {
				await tx
					.insert(departments)
					.values({ code, name: "Synthetic department" });
				await tx.insert(positions).values({ code, name: "Synthetic position" });
				await tx
					.insert(buildings)
					.values({ id: buildingId, code, name: "Synthetic building" });
			});
			auth = createAuth(config, db);
			server = createApp({ db, auth }, config.CORS_ORIGIN).listen(
				0,
				"127.0.0.1",
			);
			await new Promise<void>((done) => server.once("listening", done));
			const address = server.address();
			if (!address || typeof address === "string")
				throw new Error("Local listener unavailable");
			base = `http://127.0.0.1:${address.port}`;
		}, 20_000);
		afterAll(async () => {
			if (web?.pid && !web.killed && typeof web.exitCode !== "number") {
				const stopped = new Promise<void>((done) =>
					web?.once("exit", () => done()),
				);
				web.kill();
				await stopped;
			}
			await unlink(inputPath).catch(() => {});
			if (server) {
				server.closeAllConnections();
				await new Promise<void>((done) => server.close(() => done()));
			}
			if (db) {
				await db.transaction(async (tx) => {
					const created = await tx
						.select({ id: user.id })
						.from(user)
						.where(like(user.email, `${prefix}%`));
					if (created.length) {
						const ids = created.map((row) => row.id);
						await tx.delete(srProfiles).where(inArray(srProfiles.userId, ids));
						await tx.delete(user).where(inArray(user.id, ids));
					}
					await tx.delete(buildings).where(eq(buildings.id, buildingId));
					await tx.delete(positions).where(eq(positions.code, code));
					await tx.delete(departments).where(eq(departments.code, code));
				});
				await db.$client.end();
			}
		}, 20_000);

		test("dry-run is read-only and produces no credentials", async () => {
			const result = await run(csv(inputRow(0)), "dry-run");
			expect(result).toEqual({ mode: "dry-run", created: 1, unchanged: 0 });
			expect(await count(0)).toBe(0);
			expect(
				(await cli(false)).includes("dry-run: would create=1, unchanged=0"),
			).toBe(true);
			expect(await count(0)).toBe(0);
		});
		test("one dummy: CSV, Better Auth hash, SR identity, login and mandatory password change", async () => {
			const output = await cli(true);
			expect(output.includes("apply: created=1, unchanged=0")).toBe(true);
			const relativePath =
				/Credentials: (.+) \(check adjacent status.json\)/.exec(output)?.[1];
			if (!relativePath)
				throw new Error("CLI did not return its private export path");
			const result = { credentialsFile: resolve(projectRoot, relativePath) };
			expect((await state(result.credentialsFile)).state).toBe("COMMITTED");
			const rows = await exported(result.credentialsFile);
			expect(rows.length).toBe(1);
			const entry = rows[0];
			const temporary = entry?.[3];
			if (!temporary) throw new Error("Missing initial credential");
			expect(/^[A-Za-z0-9]{8}$/.test(temporary)).toBe(true);
			expect(output.includes(temporary)).toBe(false);
			expect(entry?.[0]).toBe(nims[0]);
			const records = await db
				.select({
					id: user.id,
					hash: account.password,
					actor: userProfiles.actor,
					active: userProfiles.isActive,
					mustChange: userProfiles.mustChangePassword,
					department: srProfiles.departmentCode,
					position: srProfiles.positionCode,
					building: srProfiles.buildingId,
				})
				.from(user)
				.innerJoin(account, eq(account.userId, user.id))
				.innerJoin(userProfiles, eq(userProfiles.userId, user.id))
				.innerJoin(srProfiles, eq(srProfiles.userId, user.id))
				.where(eq(user.username, nims[0] ?? ""));
			const identity = records[0];
			if (!identity?.hash) throw new Error("Missing identity credential");
			expect(identity.actor).toBe("SR");
			expect(identity.active).toBe(true);
			expect(identity.mustChange).toBe(true);
			expect(identity.department).toBe(code);
			expect(identity.position).toBe(code);
			expect(identity.building).toBe(buildingId);
			expect(
				(
					await db
						.select()
						.from(systemPrivileges)
						.where(eq(systemPrivileges.userId, identity.id))
				).length,
			).toBe(0);
			expect(identity.hash === temporary).toBe(false);
			expect(
				await (await auth.$context).password.verify({
					hash: identity.hash,
					password: temporary,
				}),
			).toBe(true);
			const login = await fetch(`${base}/api/auth/sign-in/username`, {
				method: "POST",
				headers: {
					origin: config.CORS_ORIGIN,
					"content-type": "application/json",
				},
				body: JSON.stringify({ username: nims[0], password: temporary }),
			});
			expect(login.status).toBe(200);
			const cookie = cookies(login);
			expect((await rpc(cookie)).status).toBe(403);
			await startWeb();
			if (webBase) {
				expect((await dashboard()).headers.get("location")).toBe(
					"/login?reason=session",
				);
				expect((await dashboard(cookie)).headers.get("location")).toBe(
					"/change-password",
				);
			}
			const session = (await (
				await rpc(cookie, "identity.session")
			).json()) as { result: { data: { mustChangePassword: boolean } } };
			expect(session.result.data.mustChangePassword).toBe(true);
			expect((await auth.$context).password.config.minPasswordLength).toBe(8);
			const tooShort = "A1b2C";
			const rejectedChange = await native(
				"change-password",
				{ currentPassword: temporary, newPassword: tooShort },
				cookie,
			);
			expect(rejectedChange.status).toBe(400);
			expect(((await rejectedChange.json()) as { code: string }).code).toBe(
				"PASSWORD_TOO_SHORT",
			);
			expect((await rpc(cookie)).status).toBe(403);
			const newPassword = `R!${randomBytes(32).toString("base64url")}`;
			const changed = await native(
				"change-password",
				{ currentPassword: temporary, newPassword },
				cookie,
			);
			expect(changed.status).toBe(200);
			expect((await rpc(cookies(changed))).status).toBe(200);
			if (webBase) {
				expect((await dashboard(cookies(changed))).status).toBe(200);
				console.info(
					"Production dashboard HTTP smoke: anonymous redirect, password gate and authenticated dashboard passed",
				);
			}
			expect(
				(
					await native("sign-in/username", {
						username: nims[0],
						password: temporary,
					})
				).status,
			).toBe(401);
			expect(
				(
					await native("sign-in/username", {
						username: nims[0],
						password: newPassword,
					})
				).status,
			).toBe(200);
		}, 30_000);
		test("re-import never resets password or outputs old credentials; conflicts reject", async () => {
			const original = await db
				.select({ hash: account.password })
				.from(account)
				.innerJoin(user, eq(user.id, account.userId))
				.where(eq(user.username, nims[0] ?? ""));
			expect(await run(csv(inputRow(0)))).toEqual({
				mode: "apply",
				created: 0,
				unchanged: 1,
			});
			let conflict: unknown;
			try {
				await run(
					csv(
						[
							...inputRow(0).slice(0, 1),
							"Changed name",
							...inputRow(0).slice(2),
						],
						inputRow(1),
					),
				);
			} catch (error) {
				conflict = error;
			}
			expect(
				conflict instanceof Error &&
					conflict.message.includes("EXISTING_ACCOUNT_CONFLICT"),
			).toBe(true);
			expect(await count(1)).toBe(0);
			const after = await db
				.select({ hash: account.password })
				.from(account)
				.innerJoin(user, eq(user.id, account.userId))
				.where(eq(user.username, nims[0] ?? ""));
			expect(original[0]?.hash === after[0]?.hash).toBe(true);
		});
		test("inactive SR is created safely but cannot log in", async () => {
			const result = await run(csv(inputRow(1, false)));
			const temporary = (await exported(result.credentialsFile))[0]?.[3];
			const response = await native("sign-in/username", {
				username: nims[1],
				password: temporary,
			});
			expect(response.status).toBe(401);
			expect(
				Boolean(temporary && (await response.text()).includes(temporary)),
			).toBe(false);
		}, 20_000);
		test("multi-row import yields one CSV with distinct secure passwords", async () => {
			const result = await run(csv(inputRow(2), inputRow(3)));
			expect(result.created).toBe(2);
			const rows = await exported(result.credentialsFile);
			expect(rows.length).toBe(2);
			expect(new Set(rows.map((row) => row[3])).size).toBe(2);
			expect(rows.every((row) => /^[A-Za-z0-9]{8}$/.test(row[3] ?? ""))).toBe(
				true,
			);
		}, 20_000);
		test("invalid CSV, duplicate identity and missing organization mutate nothing", async () => {
			await rejected(
				run(csv(inputRow(4), inputRow(4))),
				"DUPLICATE_CSV_IDENTITY",
			);
			await rejected(
				run(
					csv([...inputRow(4).slice(0, 3), "MISSING", ...inputRow(4).slice(4)]),
				),
				"UNKNOWN_ORGANIZATION_REFERENCE",
			);
			expect(await count(4)).toBe(0);
		});
		test("credential output failure prevents any account creation", async () => {
			await rejected(
				run(csv(inputRow(5)), "apply", async () => {
					throw new Error("Injected secret filesystem detail");
				}),
				"PROVISIONING_FAILED_NO_ACCOUNTS_COMMITTED",
			);
			expect(await count(5)).toBe(0);
			await rejected(
				provisionSrAccounts({
					db,
					csv: csv(inputRow(5)),
					authConfig: config,
					projectRoot: resolve(projectRoot, "missing-private-root"),
					mode: "apply",
				}),
				"CREDENTIAL_EXPORT_FAILED",
			);
			expect(await count(5)).toBe(0);
		}, 20_000);
		test("late uniqueness failure rolls back the entire batch, retaining a FAILED private export", async () => {
			let path: string | undefined;
			await rejected(
				run(csv(inputRow(6), inputRow(7)), "apply", async (records) => {
					const bundle = await prepareCredentials(projectRoot, records);
					path = bundle.path;
					await db.insert(user).values({
						id: `${prefix}-race`,
						username: nims[7],
						name: "Synthetic racing user",
						email: `${prefix}-race@example.invalid`,
					});
					return bundle;
				}),
				"PROVISIONING_FAILED_NO_ACCOUNTS_COMMITTED",
			);
			expect(await count(6)).toBe(0);
			expect(await count(7)).toBe(1); // Only the independent racing writer exists.
			expect((await state(path)).state).toBe("FAILED");
			expect((await exported(path)).length).toBe(2);
		}, 20_000);
		test("post-commit metadata failure preserves recoverable credentials and does not reset on retry", async () => {
			let path: string | undefined;
			await rejected(
				run(csv(inputRow(8)), "apply", async (records) => {
					const bundle = await prepareCredentials(projectRoot, records);
					path = bundle.path;
					return {
						path: bundle.path,
						mark: async (status) => {
							if (status === "COMMITTED")
								throw new Error("Injected metadata write failure");
							await bundle.mark(status);
						},
					};
				}),
				"IMPORT_OUTCOME_UNCONFIRMED_CHECK_PRIVATE_EXPORT",
			);
			expect(await count(8)).toBe(1);
			expect((await state(path)).state).toBe("UNCONFIRMED");
			const password = (await exported(path))[0]?.[3];
			expect(
				(await native("sign-in/username", { username: nims[8], password }))
					.status,
			).toBe(200);
			expect(await run(csv(inputRow(8)))).toEqual({
				mode: "apply",
				created: 0,
				unchanged: 1,
			});
		}, 20_000);
		test("concurrent identical imports produce one account and one credentials export", async () => {
			const results = await Promise.all([
				run(csv(inputRow(9))),
				run(csv(inputRow(9))),
			]);
			expect(results.map((result) => result.created).sort()).toEqual([0, 1]);
			expect(results.filter((result) => result.credentialsFile).length).toBe(1);
			expect(await count(9)).toBe(1);
		}, 20_000);
	},
);
