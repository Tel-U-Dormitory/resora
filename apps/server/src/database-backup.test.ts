import { expect, test } from "bun:test";
import { selectToc } from "@resora/db/archive-scope";
import { backupEnvironment } from "./database-backup";

test("download backup only permits the explicit Docker primary or guarded local scratch databases", () => {
	const env = backupEnvironment({
		DATABASE_URL: "postgresql://operator:synthetic@postgres:5432/resora",
	});
	expect(env.PGDATABASE).toBe("resora");
	expect(env.PGSSLMODE).toBe("disable");
	expect(env).not.toHaveProperty("DATABASE_URL");
	for (const url of [
		"postgresql://operator:synthetic@db.example.invalid/postgres",
		"postgresql://operator:synthetic@127.0.0.1/resora",
		"postgresql://operator:synthetic@postgres/other",
		"postgresql://operator:synthetic@postgres:6543/resora",
		"postgresql://operator:synthetic@postgres/resora?host=remote.invalid",
		"postgresql://operator:synthetic@postgres/resora#override",
		"postgresql://operator@postgres/resora",
	])
		expect(() => backupEnvironment({ DATABASE_URL: url })).toThrow();
	expect(() =>
		backupEnvironment({
			DATABASE_URL: "postgresql://operator:synthetic@postgres/resora",
			DB_SSL_CA: "synthetic",
		}),
	).toThrow();
});

test("download archive validation requires migration metadata and excludes managed objects", () => {
	const metadata = "1; 0 0 TABLE DATA drizzle __drizzle_migrations postgres";
	expect(selectToc(`${metadata}\n2; 0 0 TABLE public user postgres`)).toContain(
		"TABLE public user",
	);
	for (const entry of [
		"TABLE auth users postgres",
		"TABLE storage objects postgres",
		"EXTENSION - pgcrypto postgres",
		"DATABASE - resora postgres",
	])
		expect(() => selectToc(`${metadata}\n2; 0 0 ${entry}`)).toThrow();
	expect(() => selectToc("1; 0 0 TABLE public user postgres")).toThrow();
});
