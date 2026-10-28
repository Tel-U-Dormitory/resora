import {
	isValidSrAssignment,
	officialBuildingCodes,
	officialDepartments,
	officialPositions,
} from "@resora/db/organization";
import { z } from "zod";

export class ProvisioningError extends Error {
	constructor(
		readonly code: string,
		readonly record?: number,
	) {
		super(`${code}${record === undefined ? "" : ` (CSV record ${record})`}`);
		this.name = "ProvisioningError";
	}
}

export const csvColumns = [
	"nim",
	"name",
	"email",
	"department",
	"position",
	"building",
	"is_active",
] as const;
export const maxCsvBytes = 5 * 1024 * 1024;
const rowSchema = z
	.object({
		// Match the configured Username Plugin; never convert identifiers to numbers.
		nim: z
			.string()
			.trim()
			.min(3)
			.max(30)
			.regex(/^[a-zA-Z0-9_.]+$/),
		name: z.string().trim().min(1),
		email: z.email().transform((value) => value.toLowerCase()),
		department: z.enum(officialDepartments.map((row) => row.code)),
		position: z.enum(officialPositions.map((row) => row.code)),
		building: z.enum(officialBuildingCodes),
		is_active: z
			.enum(["true", "false", "1", "0"])
			.transform((value) => value === "true" || value === "1"),
	})
	.refine((row) => isValidSrAssignment(row.department, row.position), {
		message: "Invalid department/position assignment",
	});
export type SrImportRow = z.infer<typeof rowSchema> & { record: number };

// RFC 4180 quoting, escaped quotes and embedded newlines; no external parser.
export function readCsv(text: string): string[][] {
	if (Buffer.byteLength(text, "utf8") > maxCsvBytes || text.includes("\0"))
		throw new ProvisioningError("INVALID_CSV_SIZE_OR_CONTENT");
	const records: string[][] = [];
	let record: string[] = [];
	let field = "";
	let quoted = false;
	let closedQuote = false;
	const input = text.replace(/^\uFEFF/, "");
	const finishRecord = () => {
		record.push(field);
		if (record.length !== 1 || field !== "") records.push(record);
		if (records.length > 5001)
			throw new ProvisioningError("TOO_MANY_CSV_RECORDS");
		record = [];
		field = "";
		closedQuote = false;
	};
	for (let index = 0; index < input.length; index++) {
		const char = input[index];
		if (quoted) {
			if (char === '"') {
				if (input[index + 1] === '"') {
					field += '"';
					index++;
				} else {
					quoted = false;
					closedQuote = true;
				}
			} else field += char;
			continue;
		}
		if (char === ",") {
			record.push(field);
			field = "";
			closedQuote = false;
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && input[index + 1] === "\n") index++;
			finishRecord();
		} else if (char === '"' && field === "" && !closedQuote) {
			quoted = true;
		} else {
			if (closedQuote || char === '"')
				throw new ProvisioningError("MALFORMED_CSV");
			field += char;
		}
	}
	if (quoted) throw new ProvisioningError("MALFORMED_CSV");
	if (field !== "" || record.length || closedQuote) finishRecord();
	return records;
}

export function parseSrCsv(text: string): SrImportRow[] {
	const [header, ...records] = readCsv(text);
	const columns = header?.map((value) => value.trim());
	if (
		!columns ||
		columns.length !== csvColumns.length ||
		new Set(columns).size !== columns.length ||
		csvColumns.some((name) => !columns.includes(name))
	)
		throw new ProvisioningError("INVALID_CSV_HEADER");
	if (!records.length) throw new ProvisioningError("EMPTY_CSV_IMPORT");
	const nims = new Set<string>();
	const emails = new Set<string>();
	return records.map((fields, index) => {
		const record = index + 2;
		if (fields.length !== columns.length)
			throw new ProvisioningError("INVALID_CSV_COLUMNS", record);
		const parsed = rowSchema.safeParse(
			Object.fromEntries(
				columns.map((name, column) => [name, fields[column]?.trim()]),
			),
		);
		if (!parsed.success) throw new ProvisioningError("INVALID_CSV_ROW", record);
		if (nims.has(parsed.data.nim) || emails.has(parsed.data.email))
			throw new ProvisioningError("DUPLICATE_CSV_IDENTITY", record);
		nims.add(parsed.data.nim);
		emails.add(parsed.data.email);
		return { ...parsed.data, record };
	});
}

export function encodeCsv(records: readonly (readonly string[])[]): string {
	return `${records
		.map((fields) =>
			fields.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
		)
		.join("\r\n")}\r\n`;
}
