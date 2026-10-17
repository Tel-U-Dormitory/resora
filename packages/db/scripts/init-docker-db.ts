import "varlock/auto-load";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { ENV } from "../src/env";
import { getPoolConfig } from "../src/pool-config";

async function main() {
	let connectionString = process.env.DATABASE_URL || ENV.DATABASE_URL;

	// In Docker environment, if postgres_password secret is mounted, ensure password is set
	const secretPath = "/run/secrets/postgres_password";
	if (existsSync(secretPath)) {
		try {
			const password = readFileSync(secretPath, "utf8").trim();
			const url = new URL(connectionString);
			if (
				url.hostname === "postgres" &&
				(!url.password || url.password === "postgres")
			) {
				url.password = password;
				connectionString = url.toString();
			}
		} catch {
			// ignore URL parse errors, handled downstream
		}
	}

	const poolConfig = getPoolConfig({
		...ENV,
		DATABASE_URL: connectionString,
	});

	const pool = new Pool(poolConfig);
	let connected = false;
	const maxAttempts = 30;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const client = await pool.connect();
			await client.query("SELECT 1");
			client.release();
			connected = true;
			break;
		} catch {
			console.info(
				`[db:init] Waiting for database to be ready (attempt ${attempt}/${maxAttempts})...`,
			);
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	if (!connected) {
		console.error(
			"[db:init] Failed to connect to database after maximum attempts.",
		);
		process.exit(1);
	}

	const client = await pool.connect();
	try {
		const tableCheck = await client.query<{ exists: boolean }>(`
			SELECT EXISTS (
				SELECT FROM information_schema.tables 
				WHERE table_schema = 'drizzle' 
				AND table_name = '__drizzle_migrations'
			) as exists;
		`);

		const tableExists = tableCheck.rows[0]?.exists === true;
		if (tableExists) {
			const countRes = await client.query<{ count: number }>(
				"SELECT count(*)::int as count FROM drizzle.__drizzle_migrations",
			);
			const count = countRes.rows[0]?.count ?? 0;
			console.info(
				`[db:init] Database already initialized with ${count} migrations.`,
			);
			console.info(
				"[db:init] Preserving existing data and relations. Checking for pending migrations...",
			);
		} else {
			console.info(
				"[db:init] Fresh database detected. Creating schema and running initial migrations...",
			);
		}
	} finally {
		client.release();
	}

	const db = drizzle({ client: pool });
	const migrationsFolder = join(import.meta.dir, "../src/migrations");

	await migrate(db, {
		migrationsFolder,
		migrationsSchema: "drizzle",
		migrationsTable: "__drizzle_migrations",
	});

	console.info(
		"[db:init] Database migrations up to date. Existing content and relations preserved.",
	);
	await pool.end();
}

main().catch((error) => {
	console.error("[db:init] Database initialization failed:", error);
	process.exit(1);
});
