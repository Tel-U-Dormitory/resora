import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { getSidebarGroups, isSidebarLinkActive } from "../../config/navigation";
import { committeeError, committeePositionLabels } from "./committee-ui";

type Element = { type: unknown; props: Record<string, unknown> };
// Execute actual component JSX/callbacks with local hooks and transport doubles.
// No HTTP, browser, React hydration or new test framework.
function fixture(file: string, extraExports = "") {
	const states: unknown[] = [];
	const queries: Record<string, unknown>[] = [];
	const mutations: { operation: string; input: unknown }[] = [];
	let cursor = 0;
	let result: Record<string, unknown> = {
		isPending: false,
		isError: false,
		data: undefined,
	};
	const mocks: Record<string, unknown> = {
		"react/jsx-runtime": jsxRuntime,
		react: {
			useState: (initial: unknown) => {
				const index = cursor++;
				if (!(index in states)) states[index] = initial;
				return [
					states[index],
					(value: unknown) => {
						states[index] = value;
					},
				];
			},
			useEffect: () => {},
		},
		"@tanstack/react-query": {
			useQuery: (options: Record<string, unknown>) => {
				queries.push(options);
				return { ...result, refetch: () => {} };
			},
		},
		"next/link": { default: "Link" },
		"next/navigation": { useRouter: () => ({ replace: () => {} }) },
		"@/components/ui/button": { Button: "Button" },
		"@/components/ui/card": { Card: "Card", CardContent: "CardContent" },
		"./committee-dialog": {
			CommitteeDialog: "CommitteeDialog",
			CommitteeFields: "CommitteeFields",
		},
		"./committee-ui": { committeeError, committeePositionLabels },
		"@/utils/trpc": {
			trpc: {
				committee: Object.fromEntries(
					["list", "detail", "candidates"].map((operation) => [
						operation,
						{ queryOptions: (input: unknown) => ({ operation, input }) },
					]),
				),
			},
			trpcClient: {
				committee: Object.fromEntries(
					[
						"create",
						"update",
						"delete",
						"createDivision",
						"updateDivision",
						"deleteDivision",
						"addMember",
						"updateMember",
						"removeMember",
					].map((operation) => [
						operation,
						{
							mutate: async (input: unknown) => {
								mutations.push({ operation, input });
							},
						},
					]),
				),
			},
		},
	};
	for (const component of ["input", "label", "select"])
		mocks[`@resora/ui/components/${component}`] = {
			[component[0]?.toUpperCase() + component.slice(1)]: component,
		};
	const source = readFileSync(new URL(file, import.meta.url), "utf8");
	const js = ts.transpileModule(source, {
		compilerOptions: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.CommonJS,
			jsx: ts.JsxEmit.ReactJSX,
		},
	}).outputText;
	const exports: Record<string, (props: Record<string, unknown>) => Element> =
		{};
	new Function("require", "exports", `${js}\n${extraExports}`)(
		(name: string) => {
			if (!(name in mocks)) throw Error(`Missing local double: ${name}`);
			return mocks[name];
		},
		exports,
	);
	return {
		states,
		queries,
		mutations,
		setQuery: (value: Record<string, unknown>) => {
			result = value;
		},
		render: (props: Record<string, unknown> = {}, name = "default") => {
			cursor = 0;
			const render = exports[name];
			if (!render) throw Error("Missing component");
			return render(props);
		},
	};
}
function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...elements(element.props.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join(" ");
	if (value && typeof value === "object" && "props" in value)
		return text((value as Element).props.children);
	return typeof value === "string" || typeof value === "number"
		? String(value)
		: "";
}
function byText(tree: Element, label: string) {
	const found = elements(tree).find(
		(row) => row.type === "Button" && text(row) === label,
	);
	if (!found) throw Error(`Missing ${label}`);
	return found;
}
function field(tree: Element, id: string) {
	const found = elements(tree).find((row) => row.props.id === id);
	if (!found) throw Error(`Missing ${id}`);
	return found;
}

test("navigation uses backend committee capability, including SYSTEM_ADMIN and mobile's shared menu", () => {
	for (const isSr of [true, false])
		for (const canManageCommittee of [true, false]) {
			const groups = getSidebarGroups({
				isSr,
				canManageEvents: true,
				isSuperadmin: !isSr,
				canManageCommittee,
			});
			expect(
				groups.some((group) =>
					group.items.some((row) => row.href === "/committees"),
				),
			).toBe(canManageCommittee);
		}
	expect(
		isSidebarLinkActive("/committees", "/committees/synthetic", false),
	).toBe(true);
	const layout = readFileSync(
		new URL("../../app/(authenticated)/committees/layout.tsx", import.meta.url),
		"utf8",
	);
	expect(layout).toContain("await getSrSession()");
	expect(layout).toContain("if (!session.canManageCommittee) redirect");
	expect(layout).toContain("session.requiresPasswordChange");
});

test("actual SSR guard rejects missing/gated/unauthorized sessions and permits managers", async () => {
	const source = readFileSync(
		new URL("../../app/(authenticated)/committees/layout.tsx", import.meta.url),
		"utf8",
	);
	const js = ts.transpileModule(source, {
		compilerOptions: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.CommonJS,
		},
	}).outputText;
	for (const [session, destination] of [
		[null, "/login?reason=session"],
		[
			{ requiresPasswordChange: true, canManageCommittee: true },
			"/change-password",
		],
		[
			{ requiresPasswordChange: false, canManageCommittee: false },
			"/dashboard",
		],
		[{ requiresPasswordChange: false, canManageCommittee: true }, null],
		...(["KADEP", "SEKDEP", "ANGGOTA"] as const).map(
			(positionCode) =>
				[
					{
						departmentCode: "HCO",
						positionCode,
						requiresPasswordChange: false,
						canManageCommittee: true,
					},
					null,
				] as const,
		),
	] as const) {
		const exports: {
			default?: (props: { children: string }) => Promise<unknown>;
		} = {};
		new Function("require", "exports", js)(
			(module: string) =>
				module === "next/navigation"
					? {
							redirect: (path: string) => {
								throw Error(path);
							},
						}
					: { getSrSession: async () => session },
			exports,
		);
		if (!exports.default) throw Error("Missing SSR guard");
		if (destination) {
			try {
				await exports.default({ children: "content" });
				throw Error("Unexpected access");
			} catch (error) {
				expect((error as Error).message).toBe(destination);
			}
		} else
			expect(await exports.default({ children: "content" })).toBe("content");
	}
});

test("list renders loading, local error/retry, empty state and safe counts with bounded search pagination", () => {
	const f = fixture("committee-list.tsx");
	f.setQuery({ isPending: true });
	expect(text(f.render())).toContain("Memuat kepanitiaan");
	f.setQuery({ isError: true, error: Error("sensitive SQL") });
	const failed = f.render();
	expect(text(failed)).not.toContain("sensitive SQL");
	expect(byText(failed, "Coba kembali")).toBeDefined();
	f.setQuery({ data: { total: 0, committees: [] } });
	expect(text(f.render())).toContain("Belum ada kepanitiaan");
	f.setQuery({
		data: {
			total: 21,
			committees: [
				{
					id: "synthetic",
					name: "Welday",
					description: "Test",
					divisionCount: 2,
					memberCount: 50,
				},
			],
		},
	});
	let tree = f.render();
	expect(text(tree)).toContain("50");
	expect(byText(tree, "Sebelumnya").props.disabled).toBe(true);
	(byText(tree, "Berikutnya").props.onClick as () => void)();
	tree = f.render();
	expect(f.queries.at(-1)?.input).toMatchObject({ offset: 20, limit: 20 });
	(field(tree, "committee-search").props.onChange as (event: unknown) => void)({
		target: { value: "Welday" },
	});
	f.render();
	expect(f.queries.at(-1)?.input).toMatchObject({
		search: "Welday",
		offset: 0,
	});
});

test("create/edit metadata and confirmations invoke the correct scoped mutation", async () => {
	const f = fixture(
		"committee-detail.tsx",
		"exports.Editor = CommitteeEditor;",
	);
	const data = {
		id: "synthetic",
		name: "Welday",
		description: "Test",
		divisions: [{ id: "division", name: "Acara" }],
		members: [],
		positions: ["ANGGOTA", "PIC1"],
	};
	for (const kind of [
		"committee",
		"deleteCommittee",
		"division",
		"deleteDivision",
		"member",
		"removeMember",
		"addMember",
		"addDivision",
	]) {
		const member = {
			userId: "sr",
			name: "Synthetic SR",
			nim: "0001",
			divisionId: "division",
			positionCode: "ANGGOTA",
		};
		const tree = f.render(
			{
				editor: { kind, member, division: data.divisions[0] },
				data,
				onClose: () => {},
				onDeleted: () => {},
			},
			"Editor",
		);
		expect(tree.type).toBe("CommitteeDialog");
		expect(tree.props.description).toContain("Welday");
		if (kind === "removeMember")
			expect(tree.props.description).toContain("Synthetic SR (0001)");
		const fields = new FormData();
		fields.set("name", " Renamed ");
		fields.set("description", " Description ");
		fields.set("userId", "sr");
		fields.set("divisionId", "division");
		fields.set("positionCode", "PIC1");
		await (tree.props.onSubmit as (fields: FormData) => Promise<unknown>)(
			fields,
		);
		expect(f.mutations.at(-1)?.input).toMatchObject({
			committeeId: "synthetic",
		});
	}
	expect(f.mutations.map((row) => row.operation)).toEqual([
		"update",
		"delete",
		"updateDivision",
		"deleteDivision",
		"updateMember",
		"removeMember",
		"addMember",
		"createDivision",
	]);
	expect(f.mutations[0]?.input).toMatchObject({
		name: "Renamed",
		description: "Description",
	});
	const list = fixture("committee-list.tsx");
	list.setQuery({ data: { total: 0, committees: [] } });
	(byText(list.render(), "Tambah kepanitiaan").props.onClick as () => void)();
	const dialog = elements(list.render()).find(
		(row) => row.type === "CommitteeDialog",
	);
	const fields = new FormData();
	fields.set("name", " New ");
	if (!dialog) throw Error("Missing create dialog");
	await (dialog.props.onSubmit as (data: FormData) => Promise<unknown>)(fields);
	expect(list.mutations).toEqual([
		{ operation: "create", input: { name: "New", description: "" } },
	]);
});

test("member selection searches only with two characters and preserves division/position assignment", () => {
	const f = fixture("committee-detail.tsx", "exports.Fields = MemberFields;");
	const committee = {
		id: "synthetic",
		divisions: [{ id: "division", name: "Acara" }],
		positions: [
			"ANGGOTA",
			"SEKDEP",
			"KADEP",
			"SEKRE",
			"BENDAHARA",
			"PIC1",
			"PIC2",
			"PJ",
		],
	};
	f.setQuery({ data: [] });
	let tree = f.render({ committee }, "Fields");
	expect(f.queries.at(-1)?.enabled).toBe(false);
	expect(field(tree, "candidate-user").props.required).toBe(true);
	(field(tree, "candidate-search").props.onChange as (value: unknown) => void)({
		target: { value: "Syn" },
	});
	f.setQuery({ data: [{ userId: "sr", name: "Synthetic SR", nim: "0001" }] });
	tree = f.render({ committee }, "Fields");
	expect(f.queries.at(-1)?.enabled).toBe(true);
	expect(text(tree)).toContain("Synthetic SR");
	expect(field(tree, "member-division").props.name).toBe("divisionId");
	expect(field(tree, "member-position").props.name).toBe("positionCode");
	expect(
		elements(tree).filter(
			(row) =>
				row.type === "option" &&
				["PIC1", "PIC2", "PJ"].includes(String(row.props.value)),
		),
	).toHaveLength(3);
	(field(tree, "candidate-user").props.onChange as (value: unknown) => void)({
		target: { value: "sr" },
	});
	tree = f.render({ committee }, "Fields");
	expect(field(tree, "candidate-user").props.value).toBe("sr");
	(field(tree, "candidate-search").props.onChange as (value: unknown) => void)({
		target: { value: "Different" },
	});
	tree = f.render({ committee }, "Fields");
	expect(field(tree, "candidate-user").props.value).toBe("");
});

test("detail keeps ineligible members visible/removable and uses responsive cards with paginated search", () => {
	const f = fixture("committee-detail.tsx");
	const members = Array.from({ length: 16 }, (_, index) => ({
		userId: String(index),
		name: `Synthetic ${index}`,
		nim: `000${index}`,
		divisionId: "division",
		positionCode: "ANGGOTA",
		eligible: index !== 0,
	}));
	f.setQuery({
		data: {
			id: "synthetic",
			name: "Welday",
			description: "",
			divisions: [{ id: "division", name: "Acara" }],
			members,
			positions: ["ANGGOTA"],
		},
	});
	let tree = f.render({ committeeId: "synthetic" });
	expect(byText(tree, "Hapus kepanitiaan").props.disabled).toBe(true);
	expect(byText(tree, "Edit penugasan").props.disabled).toBe(true);
	expect(byText(tree, "Keluarkan").props.disabled).toBeUndefined();
	expect(text(tree)).toContain("Tidak eligible");
	expect(elements(tree).filter((row) => row.type === "li")).toHaveLength(16); // 1 division + 15 members
	expect(elements(tree).some((row) => row.type === "table")).toBe(false);
	(field(tree, "member-search").props.onChange as (value: unknown) => void)({
		target: { value: "00015" },
	});
	tree = f.render({ committeeId: "synthetic" });
	expect(text(tree)).toContain("Synthetic 15");
	expect(text(tree)).not.toContain("Synthetic 14");
});

function submitFixture(fail = false) {
	const source = ts.createSourceFile(
		"dialog.tsx",
		readFileSync(new URL("committee-dialog.tsx", import.meta.url), "utf8"),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	let callback = "";
	function visit(node: ts.Node) {
		if (
			ts.isJsxAttribute(node) &&
			node.name.getText(source) === "onSubmit" &&
			node.initializer &&
			ts.isJsxExpression(node.initializer)
		)
			callback = node.initializer.expression?.getText(source) ?? "";
		ts.forEachChild(node, visit);
	}
	visit(source);
	const observed = {
		calls: 0,
		busy: false,
		error: "",
		closes: 0,
		successes: 0,
		invalidations: 0,
	};
	const scope = {
		submitting: { current: false },
		setBusy: (value: boolean) => {
			observed.busy = value;
		},
		setError: (value: string) => {
			observed.error = value;
		},
		FormData: class {},
		onSubmit: async () => {
			observed.calls++;
			if (fail) throw Error("COMMITTEE_DUPLICATE");
		},
		onClose: () => {
			observed.closes++;
		},
		onSuccess: () => {
			observed.successes++;
		},
		committeeError,
		queryClient: {
			invalidateQueries: async () => {
				observed.invalidations++;
			},
		},
		trpc: { committee: { pathKey: () => ["committee"] } },
		toast: { success: () => {} },
	};
	const js = ts.transpileModule(`const callback=${callback};`, {
		compilerOptions: { target: ts.ScriptTarget.ES2022 },
	}).outputText;
	const run = new Function(...Object.keys(scope), `${js}\nreturn callback;`)(
		...Object.values(scope),
	) as (event: unknown) => Promise<void>;
	return {
		scope,
		observed,
		run: () => run({ preventDefault: () => {}, currentTarget: {} }),
	};
}
test("dialog prevents duplicate submissions, invalidates on success and closes after refresh", async () => {
	const f = submitFixture();
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	f.scope.queryClient.invalidateQueries = async () => {
		f.observed.invalidations++;
		await pending;
	};
	const first = f.run();
	await Promise.resolve();
	await f.run();
	expect(f.observed.calls).toBe(1);
	expect(f.observed.busy).toBe(true);
	release();
	await first;
	expect(f.observed.closes).toBe(1);
	expect(f.observed.successes).toBe(1);
	expect(f.observed.invalidations).toBe(1);
});
test("refresh failure never misreports a completed mutation as failure", async () => {
	const f = submitFixture();
	f.scope.queryClient.invalidateQueries = async () => {
		throw Error("offline refresh");
	};
	await f.run();
	expect(f.observed.error).toBe("");
	expect(f.observed.closes).toBe(1);
});
test("mutation errors stay in the dialog, restore submit ability and do not invalidate data", async () => {
	const f = submitFixture(true);
	await f.run();
	expect(f.observed.error).toContain("sudah terdaftar");
	expect(f.observed.busy).toBe(false);
	expect(f.observed.closes).toBe(0);
	expect(f.observed.invalidations).toBe(0);
	await f.run();
	expect(f.observed.calls).toBe(2);
	const source = readFileSync(
		new URL("committee-dialog.tsx", import.meta.url),
		"utf8",
	);
	expect(source).toContain("if (!open && !submitting.current) onClose()");
	expect(source).toContain("disabled={busy}");
	expect(source).toContain('role="alert"');
	expect(source).toContain("initialFocus={titleRef}");
});
