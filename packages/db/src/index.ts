import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { DatabaseConfig } from "./config";
import { getPoolConfig } from "./pool-config";
import { relations } from "./relations";

export function createDb(env: DatabaseConfig) {
	const client = new Pool(getPoolConfig(env));
	return drizzle({ client, relations });
}

export type Database = ReturnType<typeof createDb>;
export type DatabaseTransaction = Parameters<
	Parameters<Database["transaction"]>[0]
>[0];
