import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomInt } from "node:crypto";
import { createDb, type Database } from "@resora/db";
import { rateLimit } from "@resora/db/schema/auth";
import { inArray } from "drizzle-orm";

import { type Auth, createAuth } from "./index";

const target = process.env.RESORA_IDENTITY_TEST_DB_URL;
function guard(value: string) {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("Invalid isolated rate-limit test target");
	}
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
		!/^\/resora_identity_test_[a-z0-9_]+$/.test(url.pathname) ||
		url.search ||
		url.hash
	) {
		throw new Error(
			"Rate-limit integration requires a loopback resora_identity_test_* database without URL options",
		);
	}
	return url;
}
test("shared limiter integration guard rejects remote and application targets", () => {
	for (const value of [
		"postgresql://remote.invalid/resora_identity_test_auth",
		"postgresql://localhost/resora",
		"postgresql://localhost/resora_identity_test_auth?host=remote.invalid",
	])
		expect(() => guard(value)).toThrow();
});

(target ? describe : describe.skip)(
	"shared limiter on isolated local PostgreSQL (migration must already exist)",
	() => {
		let db: Database | undefined;
		let auths: readonly [Auth, Auth];
		const keys: string[] = [];
		const config = {
			BETTER_AUTH_URL: "https://web.example.test",
			CORS_ORIGIN: "https://web.example.test",
			BETTER_AUTH_SECRET: "synthetic-postgres-rate-limit-secret-00000000",
			NODE_ENV: "production",
		};
		beforeAll(async () => {
			if (!target) throw new Error("Isolated local test URL is required");
			const url = guard(target);
			db = createDb({ DATABASE_URL: target, DB_POOL_MAX: 4 });
			const actual = (
				await db.$client.query(
					"SELECT current_database() AS name, host(inet_server_addr()) AS host, inet_server_port() AS port, to_regclass('public.rate_limit') AS limiter",
				)
			).rows[0];
			expect(actual.name).toBe(decodeURIComponent(url.pathname.slice(1)));
			expect(["127.0.0.1", "::1"]).toContain(actual.host);
			expect(Number(actual.port)).toBe(Number(url.port || 5432));
			if (!actual.limiter)
				throw new Error(
					"Approved rate_limit migration must be present; this test never applies migrations",
				);
			auths = [createAuth(config, db), createAuth(config, db)];
		});
		afterAll(async () => {
			if (!db) return;
			try {
				if (keys.length)
					await db.delete(rateLimit).where(inArray(rateLimit.key, keys));
			} finally {
				await db.$client.end();
			}
		});
		for (const path of ["sign-in/username", "change-password"]) {
			test(`${path}: concurrent independent instances admit 75 and return 429 for 25`, async () => {
				if (!db) throw new Error("Test database not initialized");
				const ip = `198.18.${randomInt(0, 256)}.${randomInt(1, 255)}`;
				const key = `${ip}|/${path}`;
				expect(
					await db
						.select()
						.from(rateLimit)
						.where(inArray(rateLimit.key, [key])),
				).toHaveLength(0);
				keys.push(key);
				const responses = await Promise.all(
					Array.from({ length: 100 }, (_, index) =>
						(index % 2 ? auths[1] : auths[0]).handler(
							new Request(`${config.BETTER_AUTH_URL}/api/auth/${path}`, {
								method: "POST",
								headers: {
									origin: config.CORS_ORIGIN,
									"content-type": "application/json",
									"x-resora-client-ip": ip,
								},
								body: "{}",
							}),
						),
					),
				);
				expect(
					responses.filter((response) => response.status === 400),
				).toHaveLength(75);
				expect(
					responses.filter((response) => response.status === 429),
				).toHaveLength(25);
				const rows = await db
					.select()
					.from(rateLimit)
					.where(inArray(rateLimit.key, [key]));
				expect(rows).toHaveLength(1);
				expect(rows[0]?.count).toBe(75);
			}, 15_000);
		}
	},
);
