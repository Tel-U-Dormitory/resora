import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as presentation from "@resora/api/modules/attendance/points.contracts";
import ts from "typescript";
import { participantPage } from "../../utils/participant-page";

type Node = {
	type: string;
	props: Record<string, unknown>;
	children: unknown[];
};
const React = {
	createElement: (type: string, props: object, ...children: unknown[]) => ({
		type,
		props: props ?? {},
		children,
	}),
};
function load(file: string, modules: Record<string, unknown>) {
	const code = ts.transpileModule(
		readFileSync(new URL(file, import.meta.url), "utf8"),
		{
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				jsx: ts.JsxEmit.React,
				target: ts.ScriptTarget.ES2022,
			},
		},
	).outputText;
	const exports: Record<string, unknown> = {};
	new Function("require", "exports", "React", code)(
		(name: string) =>
			modules[name] ?? {
				Button: "Button",
				Card: "Card",
				CardContent: "CardContent",
				Select: "Select",
				Input: "Input",
				default: "Link",
			},
		exports,
		React,
	);
	return exports;
}
function nodes(value: unknown): Node[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("children" in value)) return [];
	const node = value as Node;
	return [node, ...node.children.flatMap(nodes)];
}
function text(value: unknown): string {
	if (typeof value === "string" || typeof value === "number")
		return String(value);
	if (Array.isArray(value)) return value.map(text).join(" ");
	return value && typeof value === "object" && "children" in value
		? text((value as Node).children)
		: "";
}
function report(periodId = "period-a", count = 16) {
	return {
		period: {
			id: periodId,
			name: periodId,
			startsOn: "2026-01-01",
			endsOn: "2026-01-31",
		},
		events: [
			{
				eventId: "event-a",
				title: "Same title",
				startsAt: "2026-01-01T17:00:00Z",
				scoringMode: "INCLUDED",
			},
			{
				eventId: "event-b",
				title: "Same title",
				startsAt: "2026-01-01T17:00:00Z",
				scoringMode: null,
			},
		],
		participants: Array.from({ length: count }, (_, i) => ({
			userId: `sr-${i}`,
			nim: `000${i}`,
			name: `Name ${i}`,
			currentDepartmentCode: "RND",
			currentBuildingName: "Gedung A",
			currentBuildingCode: "A",
			attendedCount: 1,
			eventCount: 2,
			absentCount: 1,
			totalPoints: 14.2,
			maximumPossiblePoints: 16,
			unclassifiedCount: i === 0 ? 1 : 0,
			scoringStatus: i === 0 ? "PARTIAL" : "COMPLETE",
			events: [
				{
					eventId: "event-a",
					scoringStatus: "SCORED",
					points: i === 0 ? 4.2 : 0,
				},
				{
					eventId: "event-b",
					scoringStatus:
						i === 0 ? "UNCLASSIFIED" : i === 1 ? "UNSCORABLE" : "NOT_INVITED",
					points: null,
				},
			],
		})),
	};
}

function fixture() {
	const state: unknown[] = [];
	let cursor = 0;
	const lock = { current: false };
	const queries: {
		kind: string;
		input?: { periodId: string };
		enabled?: boolean;
	}[] = [];
	let retries = 0;
	let downloads = 0;
	let removed = 0;
	let revoked = 0;
	const periods = {
		isPending: false,
		error: null as Error | null,
		isFetching: false,
		data: [
			{
				periodId: "period-a",
				name: "Period A",
				startsOn: "2026-01-01",
				endsOn: "2026-01-31",
			},
			{
				periodId: "period-b",
				name: "Period B",
				startsOn: "2026-02-01",
				endsOn: "2026-02-28",
			},
		],
		refetch: () => {
			retries++;
		},
	};
	const recap = {
		isPending: false,
		isFetching: false,
		error: null as Error | null,
		data: report(),
		refetch: () => {
			retries++;
		},
	};
	const requests: unknown[] = [];
	const pending = Promise.withResolvers<{
		content: string;
		filename: string;
	}>();
	const scope = {
		react: {
			useState: (initial: unknown) => {
				const i = cursor++;
				if (state.length <= i) state[i] = initial;
				return [
					state[i],
					(value: unknown) => {
						state[i] = value;
					},
				];
			},
			useRef: () => lock,
		},
		"@tanstack/react-query": {
			useQuery: (options: (typeof queries)[number]) => {
				queries.push(options);
				return options.kind === "periods" ? periods : recap;
			},
		},
		"@resora/api/modules/attendance/points.contracts": presentation,
		"@/components/event-feedback": { eventErrorMessage: () => "safe error" },
		"@/utils/participant-page": { participantPage },
		"@/utils/trpc": {
			trpc: {
				attendance: {
					pointsPeriods: { queryOptions: () => ({ kind: "periods" }) },
					pointsRecap: {
						queryOptions: (input: unknown) => ({ kind: "recap", input }),
					},
				},
			},
			trpcClient: {
				attendance: {
					exportPointsCsv: {
						query: (input: unknown) => {
							requests.push(input);
							return pending.promise;
						},
					},
				},
			},
		},
	};
	const code = ts.transpileModule(
		readFileSync(new URL("points-recap.tsx", import.meta.url), "utf8"),
		{
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				jsx: ts.JsxEmit.React,
				target: ts.ScriptTarget.ES2022,
			},
		},
	).outputText;
	const exports: { default?: () => Node } = {};
	const link = {
		href: "",
		download: "",
		click: () => {
			downloads++;
		},
		remove: () => {
			removed++;
		},
	};
	new Function("require", "exports", "React", "URL", "document", code)(
		(name: string) =>
			scope[name as keyof typeof scope] ?? {
				default: "Link",
				Input: "Input",
				Select: "Select",
				Button: "Button",
				Card: "Card",
				CardContent: "CardContent",
			},
		exports,
		React,
		{
			createObjectURL: () => "blob:synthetic",
			revokeObjectURL: () => {
				revoked++;
			},
		},
		{ createElement: () => link, body: { appendChild() {} } },
	);
	const render = () => {
		cursor = 0;
		queries.length = 0;
		if (!exports.default) throw Error("Component missing");
		return exports.default();
	};
	const button = (tree: Node, label: string) => {
		const found = nodes(tree).find(
			(node) => node.type === "Button" && text(node.children) === label,
		);
		if (!found) throw Error(`Button missing: ${label}`);
		return found;
	};
	const select = (id: string) => {
		const field = nodes(render()).find((node) => node.type === "Select");
		if (!field) throw Error("Period selector missing");
		(field.props.onChange as (e: unknown) => void)({ target: { value: id } });
	};
	return {
		periods,
		recap,
		pending,
		state,
		queries,
		requests,
		render,
		select,
		button,
		link,
		observed: () => ({ retries, downloads, removed, revoked }),
	};
}

test("period loading/error/empty states and disabled initial query expose no matrix", () => {
	const f = fixture();
	f.periods.isPending = true;
	expect(text(f.render())).toContain("Memuat periode SR");
	expect(f.queries.find((q) => q.kind === "recap")?.enabled).toBe(false);
	f.periods.isPending = false;
	f.periods.error = Error("private SQL error");
	let tree = f.render();
	expect(text(tree)).toContain("safe error");
	expect(text(tree)).not.toContain("private SQL");
	(f.button(tree, "Coba kembali").props.onClick as () => void)();
	expect(f.observed().retries).toBe(1);
	f.periods.error = null;
	f.periods.data = [];
	tree = f.render();
	expect(text(tree)).toContain("Belum ada periode SR");
	expect(nodes(tree).some((n) => n.type === "table")).toBe(false);
});

test("matrix uses F2 summaries, locale numbers, distinct headers and explicit null/zero states with 15-row pagination", () => {
	const f = fixture();
	f.select("period-a");
	let tree = f.render();
	expect(text(tree)).toContain("14,2");
	expect(text(tree)).toContain("4,2");
	expect(text(tree)).toContain("Belum dinilai");
	expect(text(tree)).toContain("Tidak dapat dinilai");
	expect(text(tree)).toContain("Belum lengkap");
	expect(text(tree)).toContain("hanya mencakup skor yang diketahui");
	expect(text(tree)).toContain("saat ini, bukan riwayat");
	expect(
		nodes(tree).filter((n) => n.type === "th" && n.props.scope === "row"),
	).toHaveLength(15);
	for (const event of f.recap.data.events)
		expect(text(tree)).toContain(presentation.pointsEventHeading(event));
	expect(
		nodes(tree).find(
			(n) => n.props["aria-label"] === "Matriks poin kehadiran SR",
		)?.props.className,
	).toContain("overflow-x-auto");
	(f.button(tree, "Berikutnya").props.onClick as () => void)();
	tree = f.render();
	expect(text(tree)).toContain("00015");
	expect(
		nodes(tree).filter((n) => n.type === "th" && n.props.scope === "row"),
	).toHaveLength(1);
	const input = nodes(tree).find((n) => n.type === "Input");
	if (!input) throw Error("Search input missing");
	(input.props.onChange as (e: unknown) => void)({
		target: { value: "0000" },
	});
	tree = f.render();
	expect(text(tree)).toContain("0000");
	expect(f.state[2]).toBe(1);
	f.select("period-b");
	tree = f.render();
	expect(f.queries.find((q) => q.kind === "recap")?.input).toEqual({
		periodId: "period-b",
	});
	expect(nodes(tree).some((n) => n.type === "table")).toBe(false);
	expect(f.state[1]).toBe("");
});

test("recap loading, permission errors, empty roster/events and no search results remain explicit", () => {
	const f = fixture();
	f.select("period-a");
	f.recap.isPending = true;
	f.recap.data = report("other-period");
	expect(text(f.render())).toContain("Memuat rekap poin");
	f.recap.isPending = false;
	f.recap.error = Error("FORBIDDEN");
	let tree = f.render();
	expect(text(tree)).toContain("safe error");
	expect(nodes(tree).some((n) => n.type === "table")).toBe(false);
	f.recap.error = null;
	f.recap.data = report("period-a", 0);
	expect(text(f.render())).toContain("Belum ada anggota SR");
	f.recap.data = report();
	f.recap.data.events = [];
	f.recap.data.participants.forEach((row) => {
		row.events = [];
	});
	expect(text(f.render())).toContain("Belum ada event CLOSED");
	f.state[1] = "no match";
	tree = f.render();
	expect(text(tree)).toContain("Tidak ada SR yang sesuai pencarian");
});

test("export uses only periodId and server filename, ignores search/page, blocks duplicate downloads and cleans URL", async () => {
	const f = fixture();
	f.select("period-a");
	f.state[1] = "00015";
	f.state[2] = 2;
	const button = f.button(f.render(), "Export CSV Semua SR");
	const click = button.props.onClick as () => Promise<void>;
	const saving = click();
	await click();
	expect(f.requests).toEqual([{ periodId: "period-a" }]);
	expect(f.button(f.render(), "Menyiapkan CSV…").props.disabled).toBe(true);
	f.select("period-b");
	expect(f.state[0]).toBe("period-a");
	f.pending.resolve({
		content: "synthetic complete roster CSV",
		filename: "server-period.csv",
	});
	await saving;
	expect(f.link.download).toBe("server-period.csv");
	expect(f.observed()).toMatchObject({ downloads: 1, removed: 1, revoked: 1 });
	expect(text(f.render())).toContain("seluruh anggota periode disiapkan");
});

test("failed export retains selected period/search, reports no success and unlocks retry", async () => {
	const f = fixture();
	f.select("period-a");
	f.state[1] = "00015";
	const saving = (
		f.button(f.render(), "Export CSV Semua SR").props
			.onClick as () => Promise<void>
	)();
	f.pending.reject(Error("private SQL error"));
	await saving;
	expect(f.observed().downloads).toBe(0);
	expect(f.state[0]).toBe("period-a");
	expect(f.state[1]).toBe("00015");
	expect(text(f.render())).toContain("safe error");
	expect(f.button(f.render(), "Export CSV Semua SR").props.disabled).toBe(
		false,
	);
});

test("direct route and event-list entry use backend session capability, never structural role strings", async () => {
	for (const [session, expected] of [
		[null, "/login?reason=session"],
		[{ requiresPasswordChange: true }, "/change-password"],
		[{ canManageEventScoring: false }, "/dashboard"],
		[{ canManageEventScoring: true }, null],
	] as const) {
		const module = load("../../app/(authenticated)/events/points/page.tsx", {
			"next/navigation": {
				redirect: (path: string) => {
					throw Error(path);
				},
			},
			"@/features/identity/server": { getSrSession: async () => session },
			"@/features/attendance/public": { PointsRecap: "PointsRecap" },
		});
		const page = module.default as () => Promise<Node>;
		if (expected) await expect(page()).rejects.toThrow(expected);
		else expect((await page()).type).toBe("PointsRecap");
	}
	const module = load("../events/event-list.tsx", {
		react: { useState: (value: unknown) => [value, () => {}] },
		"next/navigation": {
			useSearchParams: () => new URLSearchParams("view=manage"),
		},
		"@tanstack/react-query": {
			useQuery: () => ({
				data: { canManage: true, isSuperadmin: false, events: [] },
			}),
		},
		"@/utils/trpc": {
			trpc: { attendance: { list: { queryOptions: () => ({}) } } },
		},
	});
	const list = module.default as (props: { canManageScoring: boolean }) => Node;
	expect(text(list({ canManageScoring: true }))).toContain(
		"Rekap Poin Kehadiran",
	);
	expect(text(list({ canManageScoring: false }))).not.toContain(
		"Rekap Poin Kehadiran",
	);
});
