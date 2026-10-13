import type { PoolConfig } from "pg";

import type { DatabaseConfig } from "./config";

export function getPoolConfig(env: DatabaseConfig): PoolConfig {
	const max = env.DB_POOL_MAX ?? 10;
	const idleTimeoutMillis = env.DB_POOL_IDLE_TIMEOUT_MS ?? 10_000;
	if (
		!Number.isInteger(max) ||
		max < 1 ||
		!Number.isInteger(idleTimeoutMillis) ||
		idleTimeoutMillis < 1
	) {
		throw new Error("Invalid database pool configuration");
	}
	if (env.DB_SSL_CA) {
		// pg URL SSL parameters override the ssl object; forbid ambiguous TLS settings.
		let params: URLSearchParams;
		try {
			params = new URL(env.DATABASE_URL).searchParams;
		} catch {
			throw new Error("Invalid database TLS configuration");
		}
		if (
			["ssl", "sslmode", "sslrootcert", "sslcert", "sslkey"].some((key) =>
				params.has(key),
			)
		) {
			throw new Error(
				"DB_SSL_CA requires a connection URL without SSL parameters",
			);
		}
	}
	return {
		connectionString: env.DATABASE_URL,
		max,
		idleTimeoutMillis,
		connectionTimeoutMillis: 10_000,
		...(env.DB_SSL_CA
			? { ssl: { ca: env.DB_SSL_CA, rejectUnauthorized: true } }
			: {}),
	};
}
