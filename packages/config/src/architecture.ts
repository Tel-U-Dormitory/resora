import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";

export type SourceMap = Map<string, string>;
const moduleRoot = "packages/api/src/modules/";
const featureRoot = "apps/web/src/features/";
const aliases: Record<string, string> = {
	"@resora/api": "packages/api/src",
	"@resora/db": "packages/db/src",
	"@resora/auth": "packages/auth/src",
	"@resora/ui": "packages/ui/src",
	"@/": "apps/web/src/",
};
function owner(path: string, root: string) {
	return path.startsWith(root) ? path.slice(root.length).split("/")[0] : null;
}
function domain(path: string) {
	return owner(path, moduleRoot);
}

export function imports(path: string, source: string) {
	const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
	const result: { specifier: string; runtime: boolean; names: string[] }[] = [];
	function visit(node: ts.Node) {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			const clause = ts.isImportDeclaration(node)
				? node.importClause
				: undefined;
			const binding = clause?.namedBindings;
			const names =
				binding && ts.isNamedImports(binding)
					? binding.elements.map((e) => (e.propertyName ?? e.name).text)
					: ["*"];
			const runtime = ts.isExportDeclaration(node)
				? !node.isTypeOnly
				: !clause?.isTypeOnly &&
					!(
						binding &&
						ts.isNamedImports(binding) &&
						binding.elements.every((e) => e.isTypeOnly)
					);
			result.push({ specifier: node.moduleSpecifier.text, runtime, names });
		}
		if (
			ts.isCallExpression(node) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) &&
					node.expression.text === "require")) &&
			node.arguments[0] &&
			ts.isStringLiteral(node.arguments[0])
		) {
			result.push({
				specifier: node.arguments[0].text,
				runtime: true,
				names: ["*"],
			});
		}
		ts.forEachChild(node, visit);
	}
	visit(file);
	return result;
}
function target(path: string, specifier: string, sources: SourceMap) {
	let base: string | undefined;
	if (specifier.startsWith("."))
		base = relative("/", resolve("/", dirname(path), specifier));
	else
		for (const [alias, replacement] of Object.entries(aliases)) {
			if (
				specifier === alias ||
				specifier.startsWith(alias.endsWith("/") ? alias : `${alias}/`)
			) {
				base = replacement + specifier.slice(alias.length);
				break;
			}
		}
	if (!base) return undefined;
	return [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		`${base}/index.ts`,
		`${base}/index.tsx`,
	].find((p) => sources.has(p));
}
const eventTables = new Set([
	"events",
	"eventParticipants",
	"eventAuditLogs",
	"eventDeletionAudits",
	"RosterCriteria",
	"EventVisibility",
	"EventEditAuditState",
]);
function toServerEntry(specifier: string) {
	return /(?:^|\/)server(?:\.ts)?$/.test(specifier);
}
const tableOwners: Record<string, string> = {
	events: "events",
	event_participants: "events",
	event_audit_logs: "events",
	event_deletion_audits: "events",
	attendance_sessions: "attendance",
	qr_challenges: "attendance",
	attendance_records: "attendance",
	attendance_audit_logs: "attendance",
	committees: "committee",
	committee_divisions: "committee",
	committee_members: "committee",
	broadcasts: "broadcast",
	user: "identity",
	account: "identity",
	session: "identity",
	verification: "identity",
	user_profiles: "identity",
	sr_profiles: "identity",
	departments: "identity",
	positions: "identity",
	buildings: "identity",
	sr_periods: "identity",
	sr_period_memberships: "identity",
	system_privileges: "identity",
	user_permission_grants: "identity",
	account_audit_logs: "identity",
};
function explicitSqlTables(path: string, source: string) {
	const result = new Set<string>();
	const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
	function visit(node: ts.Node) {
		if (
			(ts.isTaggedTemplateExpression(node) &&
				node.tag.getText(file) === "sql") ||
			(ts.isCallExpression(node) && node.expression.getText(file) === "sql.raw")
		) {
			for (const match of node
				.getText(file)
				.matchAll(
					/\b(?:from|join|update|into)\s+(?:public\.)?"?([a-z_]+)"?/gi,
				)) {
				if (match[1] && tableOwners[match[1]]) result.add(match[1]);
			}
		}
		// Also reject relational-query access without a table import.
		if (
			ts.isPropertyAccessExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === "query"
		) {
			const snake = node.name.text.replace(
				/[A-Z]/g,
				(c) => `_${c.toLowerCase()}`,
			);
			if (tableOwners[snake]) result.add(snake);
		}
		ts.forEachChild(node, visit);
	}
	visit(file);
	return result;
}
function isTestSource(path: string) {
	return /\.test\.tsx?$/.test(path) || /\/tests\//.test(path);
}

export function violations(sources: SourceMap) {
	const errors = new Set<string>();
	const graph = new Map<string, Set<string>>();
	const links = new Map<string, string[]>();
	for (const [path, source] of sources) {
		if (isTestSource(path)) continue;
		const from = domain(path);
		const application = path.startsWith("packages/api/src/application/");
		for (const table of explicitSqlTables(path, source)) {
			if (application || (from && tableOwners[table] !== from))
				errors.add(`${path} -> ${table}: foreign SQL table access`);
		}

		const feature = owner(path, featureRoot);
		for (const item of imports(path, source)) {
			const to = target(path, item.specifier, sources);
			if (item.runtime && to) links.set(path, [...(links.get(path) ?? []), to]);
			if (to && isTestSource(to))
				errors.add(`${path} -> ${to}: production import of test support`);
			const other = to ? domain(to) : null;
			if (other && from !== other) {
				if (!/\.(public|contracts)\.ts$/.test(to ?? ""))
					errors.add(`${path} -> ${to}: private module import`);
				if (from && !to?.endsWith(".contracts.ts"))
					graph.set(from, new Set([...(graph.get(from) ?? []), other]));
			}
			const otherFeature = to ? owner(to, featureRoot) : null;
			if (feature && otherFeature && feature !== otherFeature) {
				const key = `web:${feature}`;
				graph.set(
					key,
					new Set([...(graph.get(key) ?? []), `web:${otherFeature}`]),
				);
			}

			if (
				otherFeature &&
				feature !== otherFeature &&
				!/\/(public|server)\.ts$/.test(to ?? "")
			)
				errors.add(`${path} -> ${to}: private feature import`);
			if (from && to?.startsWith("packages/db/src/schema/")) {
				const schema = to.split("/").at(-1)?.replace(".ts", "");
				for (const name of item.names) {
					const expected =
						schema === "attendance"
							? eventTables.has(name)
								? "events"
								: "attendance"
							: schema === "auth" || schema === "identity"
								? "identity"
								: schema;
					if (from !== expected)
						errors.add(`${path} -> ${to}#${name}: foreign table access`);
				}
			}
			if (
				path.startsWith("packages/api/src/application/") &&
				to?.startsWith("packages/db/src/schema/")
			)
				errors.add(`${path} -> ${to}: application persistence access`);
		}
	}
	for (const start of graph.keys()) {
		const walk = (node: string, seen: string[]) => {
			for (const next of graph.get(node) ?? []) {
				if (next === start)
					errors.add(`cycle: ${[...seen, node, start].join(" -> ")}`);
				else if (!seen.includes(next) && next !== node)
					walk(next, [...seen, node]);
			}
		};
		walk(start, []);
	}
	for (const [entry, source] of sources) {
		if (
			isTestSource(entry) ||
			!(entry.startsWith("apps/web/src/") || entry.endsWith(".contracts.ts"))
		)
			continue;
		if (
			!(
				source.trimStart().startsWith('"use client"') ||
				source.trimStart().startsWith("'use client'") ||
				entry.endsWith(".contracts.ts")
			)
		)
			continue;
		const visited = new Set<string>();
		function walk(path: string) {
			if (visited.has(path)) return;
			visited.add(path);
			for (const item of imports(path, sources.get(path) ?? "")) {
				if (
					item.runtime &&
					(/^(node:|@resora\/(db|auth)(\/|$))/.test(item.specifier) ||
						item.specifier === "@trpc/server" ||
						item.specifier === "next/headers" ||
						item.specifier === "server-only" ||
						toServerEntry(item.specifier))
				)
					errors.add(
						`${entry} -> ${path}#${item.specifier}: server dependency in browser`,
					);
			}
			for (const next of links.get(path) ?? []) walk(next);
		}
		walk(entry);
	}
	return [...errors].sort();
}
export function repositorySources(root: string): SourceMap {
	const sources: SourceMap = new Map();
	function visit(dir: string) {
		if (!existsSync(dir)) return;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = resolve(dir, entry.name);
			if (
				entry.isDirectory() &&
				!["node_modules", "dist", ".next"].includes(entry.name)
			)
				visit(path);
			else if (entry.isFile() && /\.tsx?$/.test(path))
				sources.set(relative(root, path), readFileSync(path, "utf8"));
		}
	}
	for (const part of [
		"packages/api/src",
		"packages/db/src",
		"packages/auth/src",
		"packages/ui/src",
		"apps/web/src",
		"apps/server/src",
	])
		visit(resolve(root, part));
	return sources;
}
