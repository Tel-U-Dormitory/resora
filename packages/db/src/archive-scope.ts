export class ArchiveScopeError extends Error {}
function reject(code: string): never {
	throw new ArchiveScopeError(code);
}

export function selectToc(list: string) {
	const selected: string[] = [];
	for (const line of list.split(/\r?\n/)) {
		if (!line || line.startsWith(";")) continue;
		const entry = /^\d+; \d+ \d+ (.+)$/.exec(line)?.[1];
		if (!entry) reject("INVALID_ARCHIVE_TOC");
		if (/^(SCHEMA|COMMENT|ACL|DEFAULT ACL) /.test(entry)) continue;
		if (
			!/^(TABLE DATA|SEQUENCE OWNED BY|SEQUENCE SET|FK CONSTRAINT|CONSTRAINT|DEFAULT|TABLE|SEQUENCE|INDEX|FUNCTION|TRIGGER|TYPE) (public|drizzle) /.test(
				entry,
			)
		)
			reject("ARCHIVE_CONTAINS_UNSUPPORTED_OBJECT");
		selected.push(line);
	}
	if (
		!selected.some((line) =>
			line.includes("TABLE DATA drizzle __drizzle_migrations "),
		)
	)
		reject("ARCHIVE_MIGRATION_DATA_REQUIRED");
	return `${selected.join("\n")}\n`;
}
