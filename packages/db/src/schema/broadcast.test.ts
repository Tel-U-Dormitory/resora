import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { createDb } from "../index";
import { broadcasts } from "./broadcast";

const db = createDb({
	DATABASE_URL: "postgresql://127.0.0.1:1/synthetic_broadcast",
});
afterAll(() => db.$client.end());

test("broadcast schema is server-only, indexed and retains author/editor foreign keys", () => {
	const config = getTableConfig(broadcasts);
	expect(config.enableRLS).toBe(true);
	expect(config.foreignKeys).toHaveLength(2);
	for (const fk of config.foreignKeys) expect(fk.onDelete).not.toBe("cascade");
	expect(config.columns.map((column) => column.name)).toEqual([
		"id",
		"title",
		"content",
		"link_url",
		"created_by_user_id",
		"updated_by_user_id",
		"published_at",
		"expires_at",
		"archived_at",
		"created_at",
		"updated_at",
	]);
	expect(config.checks.map((check) => check.name)).toEqual([
		"broadcasts_title_valid",
		"broadcasts_content_valid",
		"broadcasts_link_valid",
		"broadcasts_expiry_valid",
	]);
	expect(config.indexes).toHaveLength(4);
	for (const column of [
		broadcasts.publishedAt,
		broadcasts.expiresAt,
		broadcasts.archivedAt,
		broadcasts.createdAt,
		broadcasts.updatedAt,
	])
		expect(column.getSQLType()).toBe("timestamp with time zone");
	const query = db.query.broadcasts
		.findMany({ with: { creator: true, editor: true } })
		.toSQL();
	expect(query.sql).toContain("broadcasts");
});

test("broadcast migration extends the existing snapshot chain without changing previous entities", () => {
	const root = resolve(import.meta.dir, "../migrations");
	const previous = JSON.parse(
		readFileSync(
			resolve(root, "20261025050126_committee_event_snapshots/snapshot.json"),
			"utf8",
		),
	);
	const current = JSON.parse(
		readFileSync(
			resolve(root, "20261026013410_dashboard_broadcast/snapshot.json"),
			"utf8",
		),
	);
	expect(current.prevIds).toEqual([previous.id]);
	const serialized = new Set<string>(
		current.ddl.map((entity: unknown) => JSON.stringify(entity)),
	);
	expect(serialized.size).toBe(current.ddl.length);
	for (const entity of previous.ddl)
		expect(serialized.has(JSON.stringify(entity))).toBe(true);
	const added = current.ddl.filter(
		(entity: unknown) =>
			!previous.ddl.some(
				(prior: unknown) => JSON.stringify(prior) === JSON.stringify(entity),
			),
	);
	expect(added).toHaveLength(23);
	for (const entity of added)
		expect(entity.table ?? entity.name).toBe("broadcasts");
});
