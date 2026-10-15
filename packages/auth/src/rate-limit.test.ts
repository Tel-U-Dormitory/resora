import { afterAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createDb } from "@resora/db";
import { rateLimit } from "@resora/db/schema/auth";
import { getTableConfig } from "drizzle-orm/pg-core";

import { type Auth, createAuth } from "./index";

const db = createDb({
	DATABASE_URL: "postgresql://127.0.0.1:1/synthetic_rate_limit",
});
afterAll(() => db.$client.end());
const config = {
	BETTER_AUTH_URL: "https://web.example.test",
	CORS_ORIGIN: "https://web.example.test",
	BETTER_AUTH_SECRET: "synthetic-rate-limit-test-secret-000000000",
	NODE_ENV: "production",
};
type Row = { id: string; key: string; count: number; lastRequest: number };

// Adapter doubles exercise Better Auth's actual database consume algorithm.
// This is offline evidence, not PostgreSQL concurrency evidence.
async function sharedInstances(enabled?: "true" | "false") {
	const rows = new Map<string, Row>();
	const selected = { ...config, AUTH_RATE_LIMIT_ENABLED: enabled };
	const auths = [createAuth(selected, db), createAuth(selected, db)] as const;
	for (const auth of auths) {
		const { adapter } = await auth.$context;
		adapter.findMany = async ({ model, where }) => {
			expect(model).toBe("rateLimit");
			const row = rows.get(String(where?.[0]?.value));
			return (row ? [{ ...row }] : []) as never;
		};
		adapter.create = async ({ model, data }) => {
			expect(model).toBe("rateLimit");
			const row = { ...data, id: randomUUID() } as unknown as Row;
			if (rows.has(row.key)) throw new Error("synthetic unique key conflict");
			rows.set(row.key, row);
			return { ...row } as never;
		};
		adapter.incrementOne = async ({ model, where, increment, set }) => {
			expect(model).toBe("rateLimit");
			const row = rows.get(
				String(where?.find((clause) => clause.field === "key")?.value),
			);
			if (
				!row ||
				!where?.every((clause) => {
					const value = row[clause.field as keyof Row];
					if (clause.operator === "lt")
						return Number(value) < Number(clause.value);
					if (clause.operator === "lte")
						return Number(value) <= Number(clause.value);
					if (clause.operator === "gt")
						return Number(value) > Number(clause.value);
					return value === clause.value;
				})
			)
				return null;
			Object.assign(row, set);
			row.count += Number(increment.count ?? 0);
			return { ...row } as never;
		};
		adapter.deleteMany = async () => 0;
	}
	return { rows, auths };
}

async function request(auth: Auth, path: string, ip = "198.51.100.70") {
	return auth.handler(
		new Request(`${config.BETTER_AUTH_URL}/api/auth/${path}`, {
			method: "POST",
			headers: {
				origin: config.CORS_ORIGIN,
				"content-type": "application/json",
				"x-resora-client-ip": ip,
			},
			// Validation rejects before account/password/session database work.
			body: "{}",
		}),
	);
}

test("rate limit schema matches the installed adapter contract", async () => {
	const table = getTableConfig(rateLimit);
	expect(
		table.columns.map((column) => [
			column.name,
			column.getSQLType(),
			column.notNull,
		]),
	).toEqual([
		["id", "text", true],
		["key", "text", true],
		["count", "integer", true],
		["last_request", "bigint", true],
	]);
	expect(rateLimit.key.isUnique).toBe(true);
	expect(table.indexes).toHaveLength(1);
	const auth = createAuth(config, db);
	const context = await auth.$context;
	expect(typeof context.adapter.incrementOne).toBe("function");
	expect(auth.options.rateLimit.storage).toBe("database");
});

test("independent auth instances share separate 75/60 login/password-change buckets", async () => {
	const { auths, rows } = await sharedInstances();
	for (const path of ["sign-in/username", "change-password"]) {
		for (let attempt = 0; attempt < 76; attempt++) {
			const response = await request(attempt % 2 ? auths[1] : auths[0], path);
			expect(response.status).toBe(attempt < 75 ? 400 : 429);
			if (attempt >= 75)
				expect(Number(response.headers.get("x-retry-after"))).toBeGreaterThan(
					0,
				);
		}
	}
	expect(rows.size).toBe(2);
	expect([...rows.values()].map((row) => row.count)).toEqual([75, 75]);
});

test("parallel initial requests are bounded across two database-backed auth contexts", async () => {
	const { auths, rows } = await sharedInstances();
	const responses = await Promise.all(
		Array.from({ length: 100 }, (_, index) =>
			request(index % 2 ? auths[1] : auths[0], "sign-in/username"),
		),
	);
	expect(responses.filter((response) => response.status === 400)).toHaveLength(
		75,
	);
	expect(responses.filter((response) => response.status === 429)).toHaveLength(
		25,
	);
	expect(rows.size).toBe(1);
	expect([...rows.values()][0]?.count).toBe(75);
});

test("NAT clients share an IP/path bucket; a different IP has its own bucket", async () => {
	const { auths } = await sharedInstances();
	for (let attempt = 0; attempt < 75; attempt++)
		expect(
			(await request(attempt % 2 ? auths[1] : auths[0], "sign-in/username"))
				.status,
		).toBe(400);
	expect((await request(auths[1], "sign-in/username")).status).toBe(429);
	expect(
		(await request(auths[1], "sign-in/username", "198.51.100.71")).status,
	).toBe(400);
});

test("database failure does not fall back to memory or expose internal errors", async () => {
	const auth = createAuth(config, db);
	(await auth.$context).adapter.findMany = async () => {
		throw new Error("synthetic-private-store-failure");
	};
	// Better Auth propagates storage failure; Express sanitizes it at its boundary.
	await expect(request(auth, "sign-in/username")).rejects.toThrow(
		"synthetic-private-store-failure",
	);
});

test("a Production process cannot downgrade shared storage through local config", () => {
	const previous = process.env.NODE_ENV;
	try {
		process.env.NODE_ENV = "production";
		expect(
			createAuth({ ...config, NODE_ENV: "development" }, db).options.rateLimit
				.storage,
		).toBe("database");
	} finally {
		if (previous === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = previous;
	}
});

test("rate limiter defaults on, accepts explicit true/false and rejects untyped invalid config", () => {
	for (const enabled of [undefined, "true", "false"] as const) {
		const auth = createAuth(
			{ ...config, AUTH_RATE_LIMIT_ENABLED: enabled },
			db,
		);
		expect(auth.options.rateLimit.enabled).toBe(enabled !== "false");
		expect(auth.options.rateLimit.storage).toBe("database");
		expect(auth.options.rateLimit.customRules).toEqual({
			"/sign-in/username": { window: 60, max: 75 },
			"/change-password": { window: 60, max: 75 },
		});
	}
	for (const enabled of ["off", "invalid", false, 0, null])
		expect(() =>
			createAuth(
				{
					...config,
					AUTH_RATE_LIMIT_ENABLED: enabled,
				} as unknown as Parameters<typeof createAuth>[0],
				db,
			),
		).toThrow("AUTH_RATE_LIMIT_ENABLED must be true or false");
});

test("explicit-on retains shared counters; explicit-off never consumes or reads limiter storage", async () => {
	const enabled = await sharedInstances("true");
	for (let attempt = 0; attempt < 76; attempt++)
		expect(
			(await request(enabled.auths[attempt % 2 ? 1 : 0], "sign-in/username"))
				.status,
		).toBe(attempt < 75 ? 400 : 429);
	expect(enabled.rows.size).toBe(1);
	const disabled = await sharedInstances("false");
	for (const auth of disabled.auths) {
		const { adapter } = await auth.$context;
		adapter.findMany = async () => {
			throw new Error("Limiter storage must not be read");
		};
		adapter.create = async () => {
			throw new Error("Limiter counter must not be created");
		};
		adapter.incrementOne = async () => {
			throw new Error("Limiter counter must not be consumed");
		};
	}
	for (const path of ["sign-in/username", "change-password"])
		for (let attempt = 0; attempt < 80; attempt++) {
			const response = await request(disabled.auths[attempt % 2 ? 1 : 0], path);
			expect(response.status).toBe(400);
		}
	expect(disabled.rows.size).toBe(0);
});
