/// <reference types="bun" />
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { isClockTime } from "./clock-time-picker";
import {
	combinePickerDateTime,
	DateTimePicker,
	formatPickerDate,
	parsePickerDate,
} from "./date-time-picker";

test("calendar parsing rejects overflow, invalid leap dates and malformed input", () => {
	for (const value of [
		"",
		"2026-02-29",
		"2026-04-31",
		"2026-13-01",
		"2026-00-01",
		"19/10/2026",
		"2026-10-19T12:00",
	]) {
		expect(parsePickerDate(value)).toBeUndefined();
	}
	for (const value of ["2028-02-29", "2026-12-31", "0001-01-01"]) {
		const parsed = parsePickerDate(value);
		expect(parsed).toBeDefined();
		if (!parsed) throw new Error("Expected valid calendar date");
		expect(formatPickerDate(parsed)).toBe(value);
	}
});

test("picker combines wall time without UTC shifts and preserves manual seconds", () => {
	expect(combinePickerDateTime("2026-10-19", "00", "05")).toBe(
		"2026-10-19T00:05",
	);
	expect(combinePickerDateTime("2026-10-19", "23", "59", "47")).toBe(
		"2026-10-19T23:59:47",
	);
	expect(combinePickerDateTime("", "23", "59", "47")).toBe("");
});

test("picker SSR retains required/disabled, analog clock action and second precision", () => {
	const markup = renderToStaticMarkup(
		<DateTimePicker
			id="synthetic-time"
			label="Waktu efektif"
			value="2026-10-19T23:59:47"
			onChange={() => {}}
			disabled
			required
			seconds
			aria-describedby="time-help"
		/>,
	);
	expect(markup).toContain('id="synthetic-time"');
	expect(markup).toContain('value="2026-10-19"');
	expect(markup).toContain("required");
	expect(markup).toContain("disabled");
	expect(markup).toContain('aria-describedby="time-help"');
	expect(markup).toContain("Waktu efektif: jam (WIB, 24 jam)");
	expect(markup).toContain("Waktu efektif: buka jam analog");
	expect(markup).toContain('id="synthetic-time-time"');
	expect(markup).toContain('value="23:59:47"');
	expect(markup).not.toContain('type="datetime-local"');
});

test("analog clock and keyboard time validation preserve 24-hour boundaries and precision", () => {
	for (const value of ["00:00", "12:30", "23:59"])
		expect(isClockTime(value)).toBe(true);
	for (const value of ["24:00", "12:60", "1:30", "12:30 PM", "", "23:59:47"])
		expect(isClockTime(value)).toBe(false);
	expect(isClockTime("23:59:47", true)).toBe(true);
	expect(isClockTime("00:00:00", true)).toBe(true);
	expect(isClockTime("23:59:60", true)).toBe(false);
});
