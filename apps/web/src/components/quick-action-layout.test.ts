import { expect, test } from "bun:test";
import { quickActionPosition } from "./quick-action-layout";

test("one to five shortcuts plus settings fit a narrow viewport without overlapping", () => {
	for (let count = 2; count <= 6; count++) {
		const points = Array.from({ length: count }, (_, index) =>
			quickActionPosition(index, count),
		);
		for (const point of points) {
			// 320px viewport, 20px right inset, 32px trigger half-width, 26px shortcut half-width.
			expect(point.x + 20 + 32 + 26).toBeLessThan(320);
			expect(point.x).toBeGreaterThanOrEqual(0);
			expect(point.y).toBeGreaterThanOrEqual(0);
			expect(Math.hypot(point.x, point.y)).toBeGreaterThan(64);
		}
		for (let index = 1; index < points.length; index++) {
			expect(
				Math.hypot(
					points[index].x - points[index - 1].x,
					points[index].y - points[index - 1].y,
				),
			).toBeGreaterThan(58);
		}
	}
});

test("fewer shortcuts cluster closer to the trigger and each other", () => {
	const first = quickActionPosition(0, 2);
	const last = quickActionPosition(1, 2);
	const full = quickActionPosition(0, 6);
	expect(Math.hypot(first.x, first.y)).toBeLessThan(Math.hypot(full.x, full.y));
	expect(
		Math.atan2(last.y, last.x) - Math.atan2(first.y, first.x),
	).toBeLessThan(Math.PI / 4);
});
