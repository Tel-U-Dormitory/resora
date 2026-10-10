import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

export function createDb(env: DatabaseConfig) {
	const client = new Pool({
		connectionString: env.DATABASE_URL,
		connectionTimeoutMillis: 10_000,
	});
	return drizzle({ client, relations });
}

export type Database = ReturnType<typeof createDb>;
