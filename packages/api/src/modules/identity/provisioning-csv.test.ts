import { expect, test } from "bun:test";
import {
	csvColumns,
	encodeCsv,
	maxCsvBytes,
	parseSrCsv,
	readCsv,
} from "./provisioning-csv";
import { localProvisioningTarget } from "./sr-provisioning";

const row = [
	"000012345",
	'Synthetic, "SR"',
	"synthetic@example.invalid",
	"HCO",
	"MEMBER",
	"A",
	"true",
];
const csv = (rows: string[][] = [row]) =>
	encodeCsv([Array.from(csvColumns), ...rows]);
test("RFC CSV roundtrip handles quotes, commas, newlines, BOM and leading-zero NIM", () => {
	const input = `\uFEFF${csv([[...row.slice(0, 1), "Synthetic\nSR", ...row.slice(2)]])}`;
	expect(parseSrCsv(input)[0]?.nim).toBe("000012345");
	expect(parseSrCsv(input)[0]?.name).toBe("Synthetic\nSR");
	expect(readCsv(csv())[1]).toEqual(row);
});
test("header order, normalized email and strict boolean values", () => {
	const reversed = encodeCsv([
		Array.from(csvColumns).reverse(),
		[...row].reverse(),
	]);
	expect(parseSrCsv(reversed)[0]?.is_active).toBe(true);
	expect(
		parseSrCsv(
			csv([
				[
					...row.slice(0, 2),
					"SYNTHETIC@EXAMPLE.INVALID",
					...row.slice(3, 6),
					"0",
				],
			]),
		)[0]?.email,
	).toBe(row[2]);
});
test("invalid headers, widths, input values and malformed quoting reject without row contents", () => {
	for (const input of [
		"",
		csv([]),
		"nim,name\n001,Test",
		csv([[...row, "extra"]]),
		csv([["", ...row.slice(1)]]),
		csv([[...row.slice(0, 6), "yes"]]),
		'a,"unclosed',
		'a,"closed"bad',
		'a,b"bad',
	]) {
		expect(() => parseSrCsv(input)).toThrow();
	}
	try {
		parseSrCsv(
			csv([[...row.slice(0, 2), "secret-invalid-email", ...row.slice(3)]]),
		);
	} catch (error) {
		expect(String(error).includes("secret-invalid-email")).toBe(false);
	}
});
test("duplicate NIM and case-insensitive email reject the entire CSV", () => {
	expect(() => parseSrCsv(csv([row, [...row]]))).toThrow(
		"DUPLICATE_CSV_IDENTITY",
	);
	expect(() =>
		parseSrCsv(
			csv([
				row,
				[
					"00099999",
					row[1] ?? "",
					"SYNTHETIC@EXAMPLE.INVALID",
					...row.slice(3),
				],
			]),
		),
	).toThrow("DUPLICATE_CSV_IDENTITY");
});
test("bounded input size and row count", () => {
	expect(() => readCsv("x".repeat(maxCsvBytes + 1))).toThrow();
	expect(() => readCsv("x\n".repeat(5002))).toThrow();
	expect(() => readCsv("a\0b")).toThrow();
});
test("provisioning rejects remote, ordinary databases and target redirection", () => {
	for (const url of [
		undefined,
		"postgresql://remote.invalid/resora_identity_test_x",
		"postgresql://127.0.0.1/resora",
		"postgresql://localhost/resora_identity_test_x?host=remote.invalid",
	])
		expect(() => localProvisioningTarget(url)).toThrow();
	expect(
		Boolean(
			localProvisioningTarget("postgresql://localhost/resora_identity_test_x"),
		),
	).toBe(true);
});
