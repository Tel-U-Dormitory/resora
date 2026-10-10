import { expect, test } from "bun:test";

import {
	connectionFailureMessage,
	getMigrationConnection,
} from "./connectivity";
import { createDb } from "./index";

test("runtime uses DATABASE_URL even when a direct URL is provided", async () => {
	const env = {
		DATABASE_URL: "postgresql://runtime:secret@localhost:5432/runtime",
		DIRECT_DB_URL: "postgresql://migration:secret@localhost:5432/migration",
	};
	const db = createDb(env);
	try {
		expect(db.$client.options.connectionString).toBe(env.DATABASE_URL);
		expect(getMigrationConnection(env).key).toBe("DIRECT_DB_URL");
		expect(getMigrationConnection(env).url).toBe(env.DIRECT_DB_URL);
	} finally {
		await db.$client.end();
	}
});

test("local migrations use DATABASE_URL only when DIRECT_DB_URL is absent", () => {
	const env = { DATABASE_URL: "postgresql://localhost/local" };
	expect(getMigrationConnection(env)).toEqual({
		key: "DATABASE_URL",
		url: env.DATABASE_URL,
	});
	expect(getMigrationConnection({ ...env, DIRECT_DB_URL: "" }).key).toBe(
		"DATABASE_URL",
	);
});

test("nested IPv6 failures explain the manual alternative without leaking secrets", () => {
	const error = new Error("postgresql://user:private-password@example/db", {
		cause: Object.assign(new Error("private-password"), {
			code: "ENETUNREACH",
		}),
	});
	const message = connectionFailureMessage(error);
	expect(message).toContain("IPv6");
	expect(message).toContain("No connection fallback");
	expect(message).not.toContain("private-password");
	expect(message).not.toContain("example");
});

test("unexpected driver messages are never logged", () => {
	const message = connectionFailureMessage(new Error("private-password"));
	expect(message).not.toContain("private-password");
	expect(message).toContain("TLS");
});
