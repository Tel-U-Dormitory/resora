import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { TRPCClientError } from "@trpc/client";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { formatEventTime } from "../attendance/event-ui";
import * as broadcastUi from "./broadcast-ui";

const item: broadcastUi.Broadcast = {
	id: "3c81f5ca-e63c-4b9c-8f9c-a8b3481b91ce",
	title: "Synthetic announcement",
	content: "Line one\nLine two",
	linkUrl: "https://example.invalid/info",
	creatorName: "Synthetic SR",
	publishedAt: "2026-01-01T00:00:00.123Z",
	expiresAt: "2026-01-08T00:00:00.123Z",
	archivedAt: null,
	status: "ACTIVE",
	canEdit: true,
	canArchive: true,
};
type Element = { type: unknown; props: Record<string, unknown> };
// Same offline JSX/hook/transport-double approach as existing committee UI tests.
function fixture(file: string) {
	const hooks: unknown[] = [];
	let cursor = 0;
	let effects: (() => void)[] = [];
	const results: Record<string, Record<string, unknown>> = {};
	const queries: Record<string, unknown>[] = [];
	const calls: { operation: string; input: unknown }[] = [];
	const invalidations: unknown[] = [];
	const successes: string[] = [];
	let failure: unknown;
	let refreshFailure = false;
	let pending: Promise<unknown> | undefined;
	let retries = 0;
	const mocks: Record<string, unknown> = {
		"react/jsx-runtime": jsxRuntime,
		react: {
			useState: (initial: unknown) => {
				const index = cursor++;
				if (!(index in hooks)) hooks[index] = initial;
				return [
					hooks[index],
					(value: unknown) => {
						hooks[index] =
							typeof value === "function" ? value(hooks[index]) : value;
					},
				];
			},
			useRef: (initial: unknown) => {
				const index = cursor++;
				hooks[index] ??= { current: initial };
				return hooks[index];
			},
			useEffect: (run: () => void, deps: unknown[]) => {
				const index = cursor++;
				const previous = hooks[index] as unknown[] | undefined;
				if (
					!previous ||
					deps.some((value, i) => !Object.is(value, previous[i]))
				)
					effects.push(run);
				hooks[index] = deps;
			},
		},
		"@tanstack/react-query": {
			useQuery: (options: Record<string, unknown>) => {
				queries.push(options);
				return {
					isPending: false,
					isFetching: false,
					isError: false,
					isSuccess: true,
					isFetchedAfterMount: true,
					refetch: () => {
						retries++;
					},
					...results[String(options.operation)],
				};
			},
		},
		"@/utils/trpc": {
			trpc: {
				broadcast: {
					pathKey: () => ["broadcast"],
					...Object.fromEntries(
						["latest", "list", "detail"].map((operation) => [
							operation,
							{ queryOptions: (input: unknown) => ({ operation, input }) },
						]),
					),
				},
			},
			trpcClient: {
				broadcast: Object.fromEntries(
					["create", "update", "archive"].map((operation) => [
						operation,
						{
							mutate: async (input: unknown) => {
								calls.push({ operation, input });
								if (pending) await pending;
								if (failure) throw failure;
							},
						},
					]),
				),
			},
			queryClient: {
				invalidateQueries: async (input: unknown) => {
					invalidations.push(input);
					if (refreshFailure) throw Error("Synthetic refresh failure");
				},
			},
		},
		"./broadcast-ui": broadcastUi,
		"../attendance/event-ui": {
			formatEventTime,
			toWibDateTimeInput: (value: string) =>
				new Date(new Date(value).getTime() + 7 * 3600000)
					.toISOString()
					.slice(0, 19),
		},
		"./broadcast-dialog": { BroadcastDialog: "BroadcastDialog" },
		"next/link": { __esModule: true, default: "Link" },
		sonner: {
			toast: { success: (message: string) => successes.push(message) },
		},
		"@/components/ui/button": { Button: "Button" },
		"@/components/ui/card": { Card: "Card", CardContent: "CardContent" },
	};
	for (const name of ["Input", "Textarea", "Label", "DateTimePicker"]) {
		const path =
			name === "DateTimePicker" ? "date-time-picker" : name.toLowerCase();
		mocks[`@resora/ui/components/${path}`] = { [name]: name };
	}
	const dialogNames = [
		"Dialog",
		"DialogContent",
		"DialogDescription",
		"DialogTitle",
	];
	mocks["@resora/ui/components/dialog"] = Object.fromEntries(
		dialogNames.map((name) => [name, name]),
	);
	const js = ts.transpileModule(
		readFileSync(new URL(file, import.meta.url), "utf8"),
		{
			compilerOptions: {
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.CommonJS,
				jsx: ts.JsxEmit.ReactJSX,
			},
		},
	).outputText;
	const exports: Record<string, (props: Record<string, unknown>) => Element> =
		{};
	new Function("require", "exports", js)((name: string) => {
		if (!(name in mocks)) throw Error(`Missing double: ${name}`);
		return mocks[name];
	}, exports);
	return {
		queries,
		calls,
		invalidations,
		successes,
		retries: () => retries,
		setQuery: (operation: string, result: Record<string, unknown>) => {
			results[operation] = result;
		},
		fail: (error: unknown) => {
			failure = error;
		},
		block: (promise: Promise<unknown>) => {
			pending = promise;
		},
		failRefresh: () => {
			refreshFailure = true;
		},
		render: (props: Record<string, unknown>, name = "default") => {
			cursor = 0;
			effects = [];
			const component = exports[name];
			if (!component) throw Error("Missing component");
			const tree = component(props);
			for (const run of effects) run();
			return tree;
		},
	};
}
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...nodes(element.props.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join(" ");
	if (value && typeof value === "object" && "props" in value)
		return text((value as Element).props.children);
	return typeof value === "string" || typeof value === "number"
		? String(value)
		: "";
}
function button(tree: Element, label: string) {
	const node = nodes(tree).find(
		(node) => node.type === "Button" && text(node) === label,
	);
	if (!node) throw Error(`Missing button ${label}`);
	return node;
}
function click(node: Element) {
	(node.props.onClick as () => void)();
}
function change(tree: Element, id: string, value: string) {
	const node = nodes(tree).find((node) => node.props.id === id);
	if (!node) throw Error(`Missing input ${id}`);
	(node.props.onChange as (event: { target: { value: string } }) => void)({
		target: { value },
	});
}
function submit(tree: Element) {
	return (
		tree.props.onSubmit as (event: {
			preventDefault: () => void;
		}) => Promise<void>
	)({ preventDefault() {} });
}

test("input validation, optional link/default expiry, WIB and original expiry preservation follow B1", () => {
	const fields = {
		title: " Title ",
		content: " Text\nMultiline ",
		linkUrl: " ",
		expiry: "",
	};
	expect(broadcastUi.broadcastInput(fields)).toEqual({
		title: "Title",
		content: "Text\nMultiline",
		linkUrl: null,
	});
	expect(
		broadcastUi.broadcastInput({ ...fields, expiry: "2026-01-02T09:30:00" })
			.expiresAt,
	).toBe("2026-01-02T02:30:00.000Z");
	expect(
		broadcastUi.broadcastInput({ ...fields, expiry: "2026-01-02T09:30:45" })
			.expiresAt,
	).toBe("2026-01-02T02:30:45.000Z");
	expect(
		broadcastUi.broadcastInput(
			{ ...fields, expiry: "2026-01-08T07:00:00" },
			item.expiresAt,
		),
	).not.toHaveProperty("expiresAt");
	for (const patch of [
		{ title: " " },
		{ content: " " },
		{ title: "x".repeat(151) },
		{ content: "x".repeat(5001) },
		{ content: "<b>HTML</b>" },
		{ linkUrl: "javascript:alert(1)" },
		{ linkUrl: "not-a-url" },
		{ expiry: "invalid" },
	])
		expect(() => broadcastUi.broadcastInput({ ...fields, ...patch })).toThrow();
});

test("dashboard enables only latest, limits cards to three, keeps empty section, capability and retry", () => {
	const f = fixture("./broadcast-feed.tsx");
	f.setQuery("latest", {
		data: Array.from({ length: 4 }, (_, i) => ({ ...item, id: String(i) })),
	});
	let tree = f.render({ view: "LATEST", canManage: false });
	expect(f.queries.filter((q) => q.enabled).map((q) => q.operation)).toEqual([
		"latest",
	]);
	expect(nodes(tree).filter((node) => node.type === "Card")).toHaveLength(3);
	expect(text(tree)).toContain("Pengumuman SR");
	expect(text(tree)).toContain("Lihat Semua");
	expect(text(tree)).not.toContain("Buat Pengumuman");
	expect(nodes(tree).find((node) => node.type === "Link")?.props.href).toBe(
		"/broadcasts",
	);
	// Read-only participants receive no management controls from DTOs.
	f.setQuery("latest", {
		data: [{ ...item, canEdit: false, canArchive: false }],
	});
	tree = f.render({ view: "LATEST", canManage: false });
	expect(text(tree)).not.toContain("Edit");
	expect(text(tree)).not.toContain("Arsipkan");
	f.setQuery("latest", { data: [] });
	tree = f.render({ view: "LATEST", canManage: true });
	expect(text(tree)).toContain("Belum ada pengumuman aktif.");
	click(button(tree, "Buat Pengumuman"));
	tree = f.render({ view: "LATEST", canManage: true });
	expect(
		nodes(tree).find((node) => node.type === "BroadcastDialog")?.props.action,
	).toEqual({ kind: "create" });
	f.setQuery("latest", { isPending: true });
	expect(text(f.render({ view: "LATEST", canManage: true }))).toContain(
		"Memuat pengumuman",
	);
	f.setQuery("latest", {
		isError: true,
		error: Error("private SQL"),
		data: [],
	});
	tree = f.render({ view: "LATEST", canManage: true });
	click(button(tree, "Coba kembali"));
	expect(f.retries()).toBe(1);
	expect(text(tree)).not.toContain("private SQL");
	expect(
		f.queries.every(
			(q) =>
				q.refetchOnMount === "always" &&
				q.staleTime === 0 &&
				q.placeholderData === undefined &&
				!("refetchInterval" in q),
		),
	).toBe(true);
});

test("ACTIVE/HISTORY use separate server pagination, clamp after archive/expiry and keep history read-only", () => {
	for (const view of ["ACTIVE", "HISTORY"]) {
		const f = fixture("./broadcast-feed.tsx");
		f.setQuery("list", {
			data: {
				items: [{ ...item, canEdit: true, canArchive: true }],
				total: 21,
			},
		});
		let tree = f.render({ view, canManage: true });
		expect(f.queries.find((q) => q.enabled)?.input).toEqual({
			view,
			limit: 10,
			offset: 0,
		});
		if (view === "HISTORY") {
			expect(text(tree)).not.toContain("Buat Pengumuman");
			expect(text(tree)).not.toContain("Edit");
			expect(text(tree)).not.toContain("Arsipkan");
		} else {
			expect(text(tree)).toContain("Edit");
			expect(text(tree)).toContain("Arsipkan");
		}
		click(button(tree, "Berikutnya"));
		tree = f.render({ view, canManage: true });
		expect(f.queries.at(-1)?.input).toEqual({ view, limit: 10, offset: 10 });
		f.setQuery("list", { data: { items: [], total: 1 } });
		f.render({ view, canManage: true });
		tree = f.render({ view, canManage: true });
		expect(f.queries.at(-1)?.input).toEqual({ view, limit: 10, offset: 0 });
		expect(button(tree, "Sebelumnya").props.disabled).toBe(true);
		expect(button(tree, "Berikutnya").props.disabled).toBe(true);
		f.setQuery("list", { data: { items: [item], total: 1 } });
		tree = f.render({ view, canManage: true });
		click(button(tree, "Baca Selengkapnya"));
		tree = f.render({ view, canManage: true });
		const dialog = nodes(tree).find((node) => node.type === "BroadcastDialog");
		expect(dialog?.props.action).toEqual({ kind: "detail", id: item.id });
		expect(dialog?.props.readOnly).toBe(view === "HISTORY");
	}
});

test("full detail safely escapes plain text, wraps long words and omits unsafe links", () => {
	const f = fixture("./broadcast-dialog.tsx");
	const content = `<script>alert('synthetic')</script>\n${"long".repeat(1000)}`;
	const tree = f.render(
		{ item: { ...item, content, linkUrl: "javascript:alert(1)" } },
		"BroadcastBody",
	);
	const html = renderToStaticMarkup(tree as never);
	expect(html).toContain("&lt;script&gt;");
	expect(html).toContain("long".repeat(1000));
	expect(html).not.toContain("<script>");
	expect(html).not.toContain("href=");
	expect(html).toContain("whitespace-pre-wrap");
	expect(html).toContain("overflow-wrap:anywhere");
	expect(html).toContain("WIB");
	const linkTree = f.render({ item }, "BroadcastBody");
	const anchor = nodes(linkTree).find((node) => node.type === "a");
	expect(anchor?.props).toMatchObject({
		href: item.linkUrl,
		target: "_blank",
		rel: "noopener noreferrer",
	});
	for (const url of [
		"data:text/html,hi",
		"//example.invalid",
		"/login",
		"bad",
		null,
	])
		expect(broadcastUi.safeBroadcastLink(url)).toBeNull();
});

test("detail loads fresh after mount, controls follow DTO and pending blocks Escape/cancel", () => {
	const f = fixture("./broadcast-dialog.tsx");
	let closes = 0;
	const props = {
		action: { kind: "edit", id: item.id },
		onClose: () => closes++,
		onAction: () => {},
	};
	f.setQuery("detail", {
		data: item,
		isFetchedAfterMount: false,
		isFetching: true,
	});
	let tree = f.render(props, "BroadcastDialog");
	expect(text(tree)).toContain("Memuat pengumuman");
	expect(
		nodes(tree).some(
			(node) => typeof node.type === "function" && "action" in node.props,
		),
	).toBe(false);
	f.setQuery("detail", { data: item });
	f.render(props, "BroadcastDialog");
	tree = f.render(props, "BroadcastDialog");
	expect(f.queries.at(-1)).toMatchObject({
		operation: "detail",
		input: { broadcastId: item.id },
		staleTime: 0,
	});
	const form = nodes(tree).find(
		(node) => typeof node.type === "function" && "submitting" in node.props,
	);
	expect(form?.props.initial).toEqual(item);
	const lock = form?.props.submitting as { current: boolean };
	lock.current = true;
	(tree.props.onOpenChange as (open: boolean) => void)(false);
	expect(closes).toBe(0);
	lock.current = false;
	(tree.props.onOpenChange as (open: boolean) => void)(false);
	expect(closes).toBe(1);
	const cancel = fixture("./broadcast-dialog.tsx");
	const confirmation = cancel.render(
		{
			action: { kind: "archive", id: item.id },
			initial: item,
			current: item,
			submitting: { current: false },
			onClose: props.onClose,
		},
		"BroadcastForm",
	);
	click(button(confirmation, "Batal"));
	expect(closes).toBe(2);
	expect(cancel.calls).toEqual([]);
	for (const readOnly of [true, false]) {
		const detail = f.render(
			{ ...props, action: { kind: "detail", id: item.id }, readOnly },
			"BroadcastDialog",
		);
		expect(text(detail).includes("Edit")).toBe(!readOnly);
		expect(text(detail).includes("Arsipkan")).toBe(!readOnly);
	}
	f.setQuery("detail", {
		data: { ...item, status: "HISTORY", canEdit: false, canArchive: false },
	});
	expect(
		text(
			f.render(
				{ ...props, action: { kind: "detail", id: item.id } },
				"BroadcastDialog",
			),
		),
	).not.toContain("Edit");
});

test("create succeeds once, retains fields on failure, invalidates only broadcast and allows safe retry", async () => {
	const f = fixture("./broadcast-dialog.tsx");
	let closes = 0;
	const lock = { current: false };
	const props = {
		action: { kind: "create" },
		initial: null,
		current: null,
		submitting: lock,
		onClose: () => closes++,
	};
	let tree = f.render(props, "BroadcastForm");
	change(tree, "broadcast-title", " Title ");
	tree = f.render(props, "BroadcastForm");
	change(tree, "broadcast-content", "Content");
	tree = f.render(props, "BroadcastForm");
	f.fail(Error("BROADCAST_EXPIRATION_EXCEEDS_SEVEN_DAYS"));
	await submit(tree);
	tree = f.render(props, "BroadcastForm");
	expect(text(tree)).toContain("publikasi pertama");
	expect(closes).toBe(0);
	expect(
		nodes(tree).find((node) => node.props.id === "broadcast-title")?.props
			.value,
	).toBe(" Title ");
	expect(button(tree, "Terbitkan Pengumuman").props.disabled).toBe(false);
	f.fail(undefined);
	let release = () => {};
	f.block(
		new Promise<void>((resolve) => {
			release = resolve;
		}),
	);
	const first = submit(tree);
	await submit(tree);
	tree = f.render(props, "BroadcastForm");
	expect(f.calls).toHaveLength(2);
	expect(button(tree, "Batal").props.disabled).toBe(true);
	expect(text(tree)).toContain("Memproses");
	release();
	await first;
	expect(closes).toBe(1);
	expect(f.successes).toEqual(["Pengumuman berhasil diterbitkan."]);
	expect(f.calls[1]).toEqual({
		operation: "create",
		input: { title: "Title", content: "Content", linkUrl: null },
	});
	expect(f.invalidations).toEqual([{ queryKey: ["broadcast"] }]);
});

test("edit preserves original expiry, archive requires explicit confirmation, completed writes survive refresh failure", async () => {
	for (const kind of ["edit", "archive"] as const) {
		const f = fixture("./broadcast-dialog.tsx");
		let closes = 0;
		const props = {
			action: { kind, id: item.id },
			initial: item,
			current: item,
			submitting: { current: false },
			onClose: () => closes++,
		};
		const tree = f.render(props, "BroadcastForm");
		expect(f.calls).toEqual([]);
		if (kind === "archive")
			expect(nodes(tree).some((node) => node.type === "Input")).toBe(false);
		f.failRefresh();
		await submit(tree);
		expect(closes).toBe(1);
		expect(f.successes).toHaveLength(1);
		expect(f.calls[0]).toEqual(
			kind === "archive"
				? { operation: "archive", input: { broadcastId: item.id } }
				: {
						operation: "update",
						input: {
							broadcastId: item.id,
							title: item.title,
							content: item.content,
							linkUrl: item.linkUrl,
						},
					},
		);
	}
	const f = fixture("./broadcast-dialog.tsx");
	f.setQuery("detail", { data: item });
	const props = {
		action: { kind: "archive", id: item.id },
		onClose: () => {},
		onAction: () => {},
	};
	f.render(props, "BroadcastDialog");
	const tree = f.render(props, "BroadcastDialog");
	expect(text(tree)).toContain(item.title);
	expect(text(tree)).toContain("Tindakan ini tidak dapat dibatalkan");
	expect(f.calls).toEqual([]);
});

test("expiry/ownership conflict refreshes authoritative data without optimistic changes or losing input", async () => {
	for (const code of [
		"BROADCAST_EXPIRED",
		"BROADCAST_ALREADY_ARCHIVED",
		"BROADCAST_NOT_OWNER",
		"BROADCAST_ACCESS_DENIED",
	]) {
		const f = fixture("./broadcast-dialog.tsx");
		const props = {
			action: { kind: "edit", id: item.id },
			initial: item,
			current: item,
			submitting: { current: false },
			onClose: () => {
				throw Error("Unexpected close");
			},
		};
		let tree = f.render(props, "BroadcastForm");
		change(tree, "broadcast-title", "Keep these changes");
		tree = f.render(props, "BroadcastForm");
		f.fail(new TRPCClientError(code));
		await submit(tree);
		tree = f.render(props, "BroadcastForm");
		expect(
			nodes(tree).find((node) => node.props.id === "broadcast-title")?.props
				.value,
		).toBe("Keep these changes");
		expect(f.successes).toEqual([]);
		expect(f.invalidations).toEqual([{ queryKey: ["broadcast"] }]);
		tree = f.render(
			{ ...props, current: { ...item, status: "HISTORY", canEdit: false } },
			"BroadcastForm",
		);
		expect(button(tree, "Simpan Perubahan").props.disabled).toBe(true);
	}
	expect(
		broadcastUi.broadcastError(Error("SQL password secret")),
	).not.toContain("SQL");
	expect(typeof broadcastUi.broadcastError(Error("constructor"))).toBe(
		"string",
	);
});

test("B2 uses session capability and preserves SSR guards, dashboard shortcuts and plain text boundaries", () => {
	const dashboard = readFileSync(
		new URL("../identity/sr-dashboard.tsx", import.meta.url),
		"utf8",
	);
	expect(dashboard).toContain(
		'<BroadcastFeed view="LATEST" canManage={session.canManageBroadcast} />',
	);
	for (const value of [
		"DashboardHeader",
		"/scan",
		"/events?view=manage",
		"/admin/users",
		"Informasi akun",
	])
		expect(dashboard).toContain(value);
	for (const file of [
		"../../app/(authenticated)/broadcasts/page.tsx",
		"../../app/(authenticated)/broadcasts/history/page.tsx",
	]) {
		const source = readFileSync(new URL(file, import.meta.url), "utf8");
		expect(source).toContain("await getSrSession()");
		expect(source).toContain("session.requiresPasswordChange");
		expect(source).toContain("session.canManageBroadcast");
	}
	for (const file of [
		"./broadcast-feed.tsx",
		"./broadcast-dialog.tsx",
		"./broadcast-ui.ts",
	]) {
		const source = readFileSync(new URL(file, import.meta.url), "utf8");
		for (const forbidden of [
			"dangerouslySetInnerHTML",
			"positionCode",
			"committeePosition",
			"refetchInterval",
			"setQueryData",
			"window.location",
		])
			expect(source).not.toContain(forbidden);
	}
});
