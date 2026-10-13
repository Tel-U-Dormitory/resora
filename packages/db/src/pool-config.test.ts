import { expect, test } from "bun:test";

import { getPoolConfig } from "./pool-config";

const DATABASE_URL = "postgresql://127.0.0.1:1/resora_unavailable";

test("persistent pool defaults preserve the explicit runtime connection", () => {
	expect(getPoolConfig({ DATABASE_URL })).toEqual({
		connectionString: DATABASE_URL,
		max: 10,
		idleTimeoutMillis: 10_000,
		connectionTimeoutMillis: 10_000,
	});
});

test("serverless pool tuning and CA require verified TLS without selecting another database", () => {
	const config = getPoolConfig({
		DATABASE_URL,
		DB_POOL_MAX: 1,
		DB_POOL_IDLE_TIMEOUT_MS: 1000,
		DB_SSL_CA: "synthetic-public-ca",
	});
	expect(config.max).toBe(1);
	expect(config.idleTimeoutMillis).toBe(1000);
	expect(config.connectionString).toBe(DATABASE_URL);
	expect(config.ssl).toEqual({
		ca: "synthetic-public-ca",
		rejectUnauthorized: true,
	});
	for (const param of ["sslmode=require", "ssl=false", "sslrootcert=other"]) {
		expect(() =>
			getPoolConfig({
				DATABASE_URL: `${DATABASE_URL}?${param}`,
				DB_SSL_CA: "synthetic-public-ca",
			}),
		).toThrow("without SSL parameters");
	}
});

test("invalid pool values fail without leaking connection information", () => {
	expect(() =>
		getPoolConfig({
			DATABASE_URL: "invalid-synthetic-private-value",
			DB_SSL_CA: "synthetic-public-ca",
		}),
	).toThrow("Invalid database TLS configuration");
	for (const value of [0, -1, 1.5, Number.NaN]) {
		expect(() => getPoolConfig({ DATABASE_URL, DB_POOL_MAX: value })).toThrow(
			"Invalid database pool configuration",
		);
		expect(() =>
			getPoolConfig({ DATABASE_URL, DB_POOL_IDLE_TIMEOUT_MS: value }),
		).toThrow("Invalid database pool configuration");
	}
});
