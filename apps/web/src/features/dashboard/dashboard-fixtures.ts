import { z } from "zod";
import type { DashboardFixture, DashboardMode } from "./dashboard.contracts";
import management from "./fixtures/management.json";
import personal from "./fixtures/personal.json";
import states from "./fixtures/states.json";

const dashboardFixtureSchema = z.object({
	mode: z.enum(["personal", "management"]),
	scope: z.enum(["individual", "department", "organization"]),
	metrics: z.array(
		z.object({
			id: z.enum(["assessment", "attendance", "violations", "cleanliness"]),
			title: z.string(),
			period: z.object({
				label: z.string(),
				startsAt: z.string().nullable(),
				endsAt: z.string().nullable(),
			}),
			scope: z.enum(["individual", "department", "organization"]),
			state: z.discriminatedUnion("kind", [
				z.object({ kind: z.literal("loading"), message: z.string() }),
				z.object({
					kind: z.literal("ready"),
					value: z.number(),
					unit: z.string().nullable(),
					note: z.string().nullable(),
				}),
				z.object({
					kind: z.literal("ready_summary"),
					values: z.array(
						z.object({
							label: z.string(),
							value: z.number(),
							unit: z.string().nullable(),
						}),
					),
					note: z.string().nullable(),
				}),
				...(
					[
						"empty",
						"not_assessed",
						"missing_period",
						"coming_soon",
						"unavailable",
						"error",
						"forbidden",
						"stale",
					] as const
				).map((kind) =>
					z.object({ kind: z.literal(kind), message: z.string() }),
				),
			]),
			export: z
				.object({
					report: z.enum(["assessment", "attendance", "violations"]),
					formats: z.array(z.enum(["xlsx", "pdf", "csv"])),
					filters: z.array(z.enum(["period", "department"])),
				})
				.nullable(),
		}),
	),
	broadcasts: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			content: z.string(),
			creatorName: z.string(),
			publishedAt: z.iso.datetime({ offset: true }),
			expiresAt: z.iso.datetime({ offset: true }),
		}),
	),
	activities: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			startsAt: z.string(),
			endsAt: z.string(),
			status: z.enum(["PUBLISHED", "CANCELLED", "ARCHIVED", "CLOSED"]),
			visible: z.boolean(),
		}),
	),
	attendanceHistory: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			startsAt: z.string(),
			endsAt: z.string(),
			presence: z.enum(["PRESENT", "PENDING", "ABSENT"]),
		}),
	),
});

// JSON fixture stays at the provider boundary and is never imported by UI components.
export const dashboardFixtures: Record<
	DashboardFixture["mode"],
	DashboardFixture
> = {
	personal: dashboardFixtureSchema.parse(personal),
	management: dashboardFixtureSchema.parse(management),
};

export function dashboardFixturesFor(
	canManage: boolean,
): Partial<Record<DashboardMode, DashboardFixture>> {
	return canManage
		? dashboardFixtures
		: { personal: dashboardFixtures.personal };
}

export const dashboardStateFixtures = z
	.record(z.string(), dashboardFixtureSchema.shape.metrics.element.shape.state)
	.parse(states);
