import { expect, test } from "bun:test";
import {
	formatEventTime,
	parseWibDateTimeInput,
	toWibDateTimeInput,
} from "./event-ui";

test("draft and manual input use explicit WIB independent of device timezone", () => {
	expect(toWibDateTimeInput("2026-10-12T06:00:00Z")).toBe("2026-10-12T13:00");
	expect(parseWibDateTimeInput("2026-10-12T13:00").toISOString()).toBe(
		"2026-10-12T06:00:00.000Z",
	);
	expect(toWibDateTimeInput("2026-10-12T06:00:15Z", true)).toBe(
		"2026-10-12T13:00:15",
	);
	expect(parseWibDateTimeInput("2026-10-12T13:00:15").toISOString()).toBe(
		"2026-10-12T06:00:15.000Z",
	);
});
test("WIB conversion handles day boundaries and invalid input keeps validation effective", () => {
	expect(toWibDateTimeInput("2026-10-12T23:30:00Z")).toBe("2026-10-13T06:30");
	expect(parseWibDateTimeInput("2026-10-13T06:30").toISOString()).toBe(
		"2026-10-12T23:30:00.000Z",
	);
	expect(Number.isFinite(parseWibDateTimeInput("").getTime())).toBe(false);
});
test("attendance display includes WIB and uses Jakarta rather than host timezone", () => {
	const output = formatEventTime("2026-10-12T06:00:00Z");
	expect(output).toContain("13.00");
	expect(output).toContain("WIB");
});
