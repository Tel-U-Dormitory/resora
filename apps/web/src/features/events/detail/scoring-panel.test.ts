import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

type Node = {
	type: string;
	props: Record<string, unknown>;
	children: unknown[];
};
const code = ts.transpileModule(
	readFileSync(new URL("scoring-panel.tsx", import.meta.url), "utf8"),
	{
		compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS },
	},
).outputText;
const exports = {} as { ScoringPanel: (props: { view: object }) => Node };
new Function("require", "exports", "React", code)(
	() =>
		Object.fromEntries(
			["Select", "Textarea", "Button", "Card", "CardHeader", "CardContent"].map(
				(name) => [name, name],
			),
		),
	exports,
	{
		createElement: (type: string, props: object, ...children: unknown[]) => ({
			type,
			props: props ?? {},
			children,
		}),
	},
);
function nodes(value: unknown): Node[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("children" in value)) return [];
	const node = value as Node;
	return [node, ...node.children.flatMap(nodes)];
}

test("event detail gives scoring and recap distinct sibling identities across refreshes and navigation", () => {
	const source = readFileSync(
		new URL("event-detail.tsx", import.meta.url),
		"utf8",
	);
	let view: Record<string, unknown>;
	const module = {} as { default: (props: { eventId: string }) => Node };
	const mutations = Object.fromEntries(
		[
			"publish",
			"activate",
			"close",
			"revoke",
			"reissue",
			"metadata",
			"scoring",
			"visibility",
			"deleteDraft",
		].map((name) => [name, { isPending: false }]),
	);
	new Function(
		"require",
		"exports",
		"React",
		ts.transpileModule(source, {
			compilerOptions: {
				jsx: ts.JsxEmit.React,
				module: ts.ModuleKind.CommonJS,
			},
		}).outputText,
	)(
		() => ({
			...Object.fromEntries(
				[
					"Card",
					"CardHeader",
					"CardContent",
					"Button",
					"StatusBadge",
					"ScoringPanel",
					"EventRecap",
					"SessionPanel",
					"MetadataPanel",
					"InvitationsPanel",
					"AdministrationPanel",
					"EventAuditHistory",
					"CalendarDays",
					"MapPin",
				].map((name) => [name, name]),
			),
			default: "a",
			useEventDetail: () => ({ detail: { data: {}, isPending: false } }),
			createDetailView: () => view,
			formatEventTime: () => "WIB",
		}),
		module,
		{
			createElement: (type: string, props: object, ...children: unknown[]) => ({
				type,
				props: props ?? {},
				children,
			}),
		},
	);
	for (const eventId of ["event-a", "event-b", "event-a"]) {
		for (const status of ["PUBLISHED", "CLOSED"]) {
			for (const mode of [null, "INCLUDED", "EXCLUDED"]) {
				view = {
					...mutations,
					event: { status, visibility: "VISIBLE", attendanceScoringMode: mode },
					session: {},
					data: {},
					canManage: true,
					activeAction: null,
				};
				const tree = module.default({ eventId });
				const siblings = tree.children
					.flat(Number.POSITIVE_INFINITY)
					.filter((child): child is Node =>
						Boolean(child && typeof child === "object" && "props" in child),
					);
				const keys = siblings
					.map((child) => child.props.key)
					.filter((key) => key != null);
				// Duplicate keys can orphan mounted DOM nodes when React reconciles past conditional siblings.
				expect(new Set(keys).size).toBe(keys.length);
				expect(
					siblings.filter((child) => child.type === "ScoringPanel"),
				).toHaveLength(1);
				expect(
					siblings.filter((child) => child.type === "EventRecap"),
				).toHaveLength(1);
			}
		}
	}
});
function fixture(
	mode: "INCLUDED" | "EXCLUDED" | null = null,
	canManage = true,
) {
	const requests: unknown[] = [];
	const errors: string[] = [];
	const view = {
		eventId: "event-a",
		event: { attendanceScoringMode: mode },
		data: { canManageScoringMode: canManage },
		busy: false,
		activeAction: null as string | null,
		scoring: {
			mutateAsync: async (input: unknown) => {
				requests.push(input);
			},
		},
		act: async (
			_action: string,
			_message: string,
			operation: () => Promise<unknown>,
		) => {
			await operation();
		},
		setError: (message: string) => errors.push(message),
	};
	const render = () => nodes(exports.ScoringPanel({ view }));
	const submit = (scoringMode: string, reason: string) => {
		const form = render().find((node) => node.type === "form");
		if (!form) throw Error("Expected scoring form");
		const event = {
			preventDefault() {},
			currentTarget: { scoringMode, reason },
		};
		const original = globalThis.FormData;
		try {
			globalThis.FormData = class {
				constructor(private data: Record<string, string>) {}
				get(key: string) {
					return this.data[key];
				}
			} as unknown as typeof FormData;
			(form.props.onSubmit as (event: unknown) => void)(event);
		} finally {
			globalThis.FormData = original;
		}
	};
	return { view, requests, errors, render, submit };
}

test("scoring status and editable controls come only from backend mode/capability", () => {
	for (const mode of [null, "INCLUDED", "EXCLUDED"] as const) {
		const f = fixture(mode, false);
		const rendered = f.render();
		expect(rendered.some((node) => node.type === "form")).toBe(false);
		expect(JSON.stringify(rendered)).toContain(
			mode === null
				? "Belum diklasifikasikan"
				: mode === "INCLUDED"
					? "Masukkan dalam penilaian"
					: "Tidak dihitung dalam penilaian",
		);
	}
	expect(
		fixture()
			.render()
			.find((node) => node.type === "Select")?.props.defaultValue,
	).toBe("");
});

test("scoring form validates changes and sends one scoped mutation; pending blocks submission", async () => {
	const f = fixture();
	f.submit("INVALID", "reason");
	f.submit("INCLUDED", "   ");
	expect(f.errors).toHaveLength(2);
	expect(f.requests).toEqual([]);
	f.submit("INCLUDED", " Approved ");
	expect(f.requests).toEqual([
		{ eventId: "event-a", scoringMode: "INCLUDED", reason: "Approved" },
	]);
	f.view.busy = true;
	f.view.activeAction = "scoring";
	f.submit("EXCLUDED", "reason");
	expect(f.requests).toHaveLength(1);
	for (const type of ["Button", "Select", "Textarea"])
		expect(f.render().find((node) => node.type === type)?.props.disabled).toBe(
			true,
		);
	expect(f.render().find((node) => node.type === "Button")?.props.loading).toBe(
		true,
	);
	const unchanged = fixture("INCLUDED");
	unchanged.submit("INCLUDED", "reason");
	expect(unchanged.requests).toEqual([]);
});

test("failed scoring mutation leaves prior mode and form intact; shared action guard refreshes only after success", async () => {
	const f = fixture("INCLUDED");
	let attempts = 0;
	let refreshes = 0;
	const pending = Promise.withResolvers<void>();
	f.view.scoring.mutateAsync = async () => {
		attempts++;
		await pending.promise;
	};
	// Execute the real shared action closure, including its synchronous duplicate guard.
	const source = readFileSync(
		new URL("detail-model.ts", import.meta.url),
		"utf8",
	);
	const file = ts.createSourceFile(
		"model.ts",
		source,
		ts.ScriptTarget.Latest,
		true,
	);
	let expression = "";
	const visit = (node: ts.Node) => {
		if (
			ts.isVariableDeclaration(node) &&
			node.name.getText(file) === "act" &&
			node.initializer
		)
			expression = node.initializer.getText(file);
		ts.forEachChild(node, visit);
	};
	visit(file);
	if (!expression) throw Error("Missing event action closure");
	const queryClient = { cancelQueries: async () => {} };
	const attendanceQueryKeys = { preview: ["preview"], qr: ["qr"] };
	const feedback: string[] = [];
	const scope = {
		actionLock: { current: false },
		setActiveAction: (value: string | null) => {
			f.view.activeAction = value;
			f.view.busy = value !== null;
		},
		setError: f.view.setError,
		setFeedback: (message: string) => feedback.push(message),
		queryClient,
		attendanceQueryKeys,
		eventErrorMessage: () => "safe error",
		refreshAttendanceQueries: async (client: unknown, keys: unknown) => {
			expect(client).toBe(queryClient);
			expect(keys).toBe(attendanceQueryKeys);
			refreshes++;
		},
	};
	const js = ts.transpileModule(`const act = ${expression}`, {
		compilerOptions: { target: ts.ScriptTarget.ES2022 },
	}).outputText;
	f.view.act = new Function(...Object.keys(scope), `${js}; return act`)(
		...Object.values(scope),
	);
	f.submit("EXCLUDED", "Retained reason");
	await f.view.act("scoring", "duplicate", async () => {
		attempts++;
	});
	await new Promise(setImmediate);
	expect(attempts).toBe(1);
	expect(refreshes).toBe(0);
	pending.reject(Error("synthetic failure"));
	await new Promise(setImmediate);
	expect(attempts).toBe(1);
	expect(f.view.event.attendanceScoringMode).toBe("INCLUDED");
	expect(f.render().find((node) => node.type === "form")?.props.key).toBe(
		"event-a:INCLUDED",
	);
	expect(f.errors).toContain("safe error");
	expect(refreshes).toBe(0);
	expect(f.view.busy).toBe(false);
	f.view.scoring.mutateAsync = async () => {
		attempts++;
	};
	f.submit("EXCLUDED", "Retained reason");
	await new Promise(setImmediate);
	expect(attempts).toBe(2);
	expect(refreshes).toBe(1);
	expect(feedback).toContain("Penilaian kehadiran berhasil disimpan.");
	expect(source).toContain("trpc.attendance.setScoringMode.mutationOptions()");
});
