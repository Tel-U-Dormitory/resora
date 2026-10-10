import { sql } from "drizzle-orm";

import type { DatabaseConfig } from "./config";
import { createDb } from "./index";

export function getMigrationConnection(
	env: DatabaseConfig & { DIRECT_DB_URL?: string },
) {
	return env.DIRECT_DB_URL
		? { key: "DIRECT_DB_URL", url: env.DIRECT_DB_URL }
		: { key: "DATABASE_URL", url: env.DATABASE_URL };
}

// Only query a constant; do not inspect schema, users, or application data.
export async function checkConnection(url: string) {
	const db = createDb({ DATABASE_URL: url });
	try {
		await db.execute(sql`SELECT 1`);
	} finally {
		await db.$client.end();
	}
}

export function connectionFailureMessage(error: unknown): string {
	if (error && typeof error === "object") {
		if ("cause" in error && error.cause) {
			return connectionFailureMessage(error.cause);
		}
		if ("code" in error) {
			switch (error.code) {
				case "ENETUNREACH":
				case "EHOSTUNREACH":
					return "Database network unreachable. Supabase Direct Connection normally requires IPv6. Check IPv6 routing or use the explicit Session Pooler alternative in docs/setup.md. No connection fallback was attempted.";
				case "ENOTFOUND":
				case "EAI_AGAIN":
					return "Database DNS lookup failed. Verify the connection URL and network privately; see docs/setup.md for Direct Connection IPv6 requirements.";
				case "28P01":
					return "Database authentication failed. Verify credentials privately.";
				case "ECONNREFUSED":
					return "Database connection refused. Check the configured port, project status, and network restrictions.";
			}
		}
	}
	// Never print driver error messages/stacks: they may contain credentials.
	return "Database connection failed. Check network/IPv6, TLS, project status, and credentials privately. See docs/setup.md; no connection fallback was attempted.";
}
