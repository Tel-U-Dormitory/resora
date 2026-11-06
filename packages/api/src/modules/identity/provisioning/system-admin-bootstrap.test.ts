import { expect, test } from "bun:test";
import { TLSSocket } from "node:tls";
import type { Database } from "@resora/db";
import {
	systemAdminInputSchema,
	validateBootstrapTarget,
	verifyBootstrapDatabase,
	verifyBootstrapTls,
} from "./system-admin-bootstrap";

test("bootstrap requires explicit guarded targets; it cannot infer Production or accept transaction poolers", () => {
	for (const value of [
		"",
		"postgresql://localhost/resora",
		"postgresql://remote.invalid/resora_identity_test_sa03_x",
		"postgresql://localhost/resora_identity_test_sa03_x?host=remote.invalid",
	])
		expect(() =>
			validateBootstrapTarget({
				mode: "local",
				url: value,
				database: "resora_identity_test_sa03_x",
			}),
		).toThrow();
	const reference = "abcdefghijklmnopqrst";
	for (const value of [
		`postgresql://postgres.${reference}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
		"postgresql://postgres@db.wrongprojectrefxxxxx.supabase.co:5432/postgres",
		`postgresql://postgres@db.${reference}.supabase.co:5432/postgres?sslmode=disable`,
	])
		expect(() =>
			validateBootstrapTarget({
				mode: "production",
				url: value,
				database: "postgres",
				reference,
			}),
		).toThrow();
	const target = validateBootstrapTarget({
		mode: "local",
		url: "postgresql://synthetic@127.0.0.1:55433/resora_identity_test_sa03_x",
		database: "resora_identity_test_sa03_x",
	});
	expect(target.hostname).toBe("127.0.0.1");
});

test("bootstrap administrative username is distinct from numeric NIM and inputs cannot assign SR attributes", () => {
	const base = {
		username: "resora.admin",
		name: "Synthetic system admin",
		email: "admin@example.invalid",
	};
	expect(systemAdminInputSchema.safeParse(base).success).toBe(true);
	for (const invalid of [
		{ username: "0000000001" },
		{ username: " " },
		{ email: "invalid" },
		{ departmentCode: "HCO" },
		{ userId: "existing-sr" },
	])
		expect(
			systemAdminInputSchema.safeParse({ ...base, ...invalid }).success,
		).toBe(false);
});

// Socket/client doubles: no network connections or Production credentials.
function tlsFixture(mode: "direct" | "session" = "session") {
	const reference = "abcdefghijklmnopqrst";
	const hostname =
		mode === "direct"
			? `db.${reference}.supabase.co`
			: "aws-0-ap-southeast-1.pooler.supabase.com";
	const username = mode === "direct" ? "postgres" : `postgres.${reference}`;
	const target = {
		mode: "production" as const,
		reference,
		database: "postgres",
		url: `postgresql://${username}@${hostname}:5432/postgres`,
	};
	const ssl = { ca: "synthetic-verified-ca", rejectUnauthorized: true };
	const socket = Object.create(TLSSocket.prototype) as TLSSocket;
	Object.defineProperties(socket, {
		encrypted: { value: true, writable: true },
		authorized: { value: true, writable: true },
		destroyed: { value: false, writable: true },
		getProtocol: { value: () => "TLSv1.3", writable: true },
		getPeerCertificate: {
			value: () => ({ subjectaltname: `DNS:${hostname}` }),
			writable: true,
		},
	});
	const observed = {
		connections: 0,
		queries: [] as string[],
		releases: [] as boolean[],
		backendTls: true as boolean | undefined,
		queryFails: false,
	};
	const client = {
		host: hostname,
		port: 5432,
		ssl,
		connection: { stream: socket },
		query: async (query: string) => {
			observed.queries.push(query);
			if (observed.queryFails) throw new Error("synthetic private detail");
			return {
				rows:
					observed.backendTls === undefined
						? []
						: [{ ssl: observed.backendTls }],
			};
		},
		release: (destroy: boolean) => observed.releases.push(destroy),
	};
	const pool = {
		options: { connectionString: target.url, ssl },
		connect: async () => {
			observed.connections++;
			return client;
		},
	};
	return {
		db: { $client: pool } as unknown as Database,
		target,
		pool,
		client,
		socket,
		observed,
	};
}

test("Session Pooler validates client TLS without requiring pooler-to-PostgreSQL TLS", async () => {
	const fixture = tlsFixture();
	fixture.observed.backendTls = false;
	await verifyBootstrapTls(fixture.db, fixture.target);
	expect(fixture.observed.connections).toBe(1);
	expect(fixture.observed.queries).toEqual([]);
	expect(fixture.observed.releases).toEqual([false]);
});

test("Direct Connection retains pg_stat_ssl on the verified client connection", async () => {
	const fixture = tlsFixture("direct");
	await verifyBootstrapTls(fixture.db, fixture.target);
	expect(fixture.observed.queries).toEqual([
		"SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()",
	]);
	expect(fixture.observed.releases).toEqual([false]);
});

test("Direct Connection rejects false/missing/error pg_stat_ssl evidence", async () => {
	for (const backendTls of [false, undefined, true]) {
		const fixture = tlsFixture("direct");
		fixture.observed.backendTls = backendTls;
		fixture.observed.queryFails = backendTls === true;
		await expect(
			verifyBootstrapTls(fixture.db, fixture.target),
		).rejects.toThrow("PRODUCTION_TLS_REQUIRED");
		expect(fixture.observed.releases).toEqual([true]);
	}
});

test("Production requires explicit CA/rejectUnauthorized and a pool bound to the approved URL before connecting", async () => {
	for (const changes of [
		{ ssl: undefined },
		{ ssl: false },
		{ ssl: { ca: "synthetic-verified-ca", rejectUnauthorized: false } },
		{ ssl: { rejectUnauthorized: true } },
		{ ssl: { ca: " ", rejectUnauthorized: true } },
		{ connectionString: "postgresql://wrong.invalid/postgres" },
	]) {
		const fixture = tlsFixture();
		Object.assign(fixture.pool.options, changes);
		await expect(
			verifyBootstrapTls(fixture.db, fixture.target),
		).rejects.toThrow("VERIFIED_PRODUCTION_TLS_CA_REQUIRED");
		expect(fixture.observed.connections).toBe(0);
	}
});

test("Session Pooler rejects unencrypted/unauthorized/closed/unestablished TLS sockets", async () => {
	for (const changes of [
		{ encrypted: false },
		{ authorized: false },
		{ destroyed: true },
		{ getProtocol: () => null },
		{ getPeerCertificate: () => ({}) },
		{ getPeerCertificate: () => ({ subjectaltname: "DNS:wrong.invalid" }) },
		{
			getPeerCertificate: () => {
				throw new Error("synthetic private certificate detail");
			},
		},
	]) {
		const fixture = tlsFixture();
		Object.assign(fixture.socket, changes);
		await expect(
			verifyBootstrapTls(fixture.db, fixture.target),
		).rejects.toThrow("PRODUCTION_TLS_REQUIRED");
		expect(fixture.observed.queries).toEqual([]);
		expect(fixture.observed.releases).toEqual([true]);
	}
});

test("Production rejects redirected clients, weakened TLS settings and missing TLS socket", async () => {
	for (const mode of ["direct", "session"] as const) {
		for (const changes of [
			{ host: "wrong.invalid" },
			{ port: 6543 },
			{ ssl: { ca: "synthetic-verified-ca", rejectUnauthorized: false } },
			{ ssl: { ca: "other-ca", rejectUnauthorized: true } },
			{ connection: {} },
			{ connection: { stream: {} } },
		]) {
			const fixture = tlsFixture(mode);
			Object.assign(fixture.client, changes);
			await expect(
				verifyBootstrapTls(fixture.db, fixture.target),
			).rejects.toThrow("PRODUCTION_TLS_REQUIRED");
			expect(fixture.observed.releases).toEqual([true]);
		}
	}
});

test("TLS handshake/connection errors are sanitized and preflight stops before SQL/schema checks", async () => {
	const fixture = tlsFixture();
	fixture.pool.connect = async () => {
		throw new Error("synthetic private connection detail");
	};
	await expect(
		verifyBootstrapDatabase(fixture.db, fixture.target, "."),
	).rejects.toThrow("PRODUCTION_TLS_CONNECTION_FAILED");
	expect(fixture.observed.queries).toEqual([]);
	expect(fixture.observed.releases).toEqual([]);
});

test("local bootstrap keeps existing loopback checks without requiring Production TLS", async () => {
	await verifyBootstrapTls({} as Database, {
		mode: "local",
		database: "resora_identity_test_sa03_x",
		url: "postgresql://synthetic@127.0.0.1:55433/resora_identity_test_sa03_x",
	});
});
