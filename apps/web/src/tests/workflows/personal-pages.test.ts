import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import * as feedback from "../../components/event-feedback";
import { queryErrorMessage } from "../../utils/request-error";

type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object") return [];
	const node = value as Node;
	return [node, ...nodes(node.props?.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join(" ");
	if (typeof value === "string" || typeof value === "number")
		return String(value);
	return value && typeof value === "object"
		? text((value as Node).props?.children)
		: "";
}
function fixture(file: string) {
	const state: unknown[] = [];
	let cursor = 0;
	const actions: string[] = [];
	const queries: Record<string, unknown>[] = [];
	let result: Record<string, unknown> = {};
	let effects: (() => void)[] = [];
	const mocks: Record<string, unknown> = {
		"react/jsx-runtime": jsx,
		react: {
			useState: (initial: unknown) => {
				const index = cursor++;
				if (!(index in state)) state[index] = initial;
				return [
					state[index],
					(value: unknown) => {
						state[index] = value;
					},
				];
			},
			useEffect: (callback: () => void) => effects.push(callback),
		},
		"@tanstack/react-query": {
			useQuery: (options: Record<string, unknown>) => {
				queries.push(options);
				return {
					isPending: false,
					isFetching: false,
					retry: false,
					refetch: () => actions.push("retry"),
					...result,
				};
			},
		},
		"@/utils/trpc": {
			trpc: {
				identity: {
					profile: {
						queryOptions: () => ({
							operation: "profile",
							queryKey: ["profile"],
						}),
					},
				},
				attendance: {
					ownHistory: {
						queryOptions: (input: unknown) => ({
							operation: "history",
							queryKey: ["history", input],
							input,
						}),
					},
				},
			},
			queryClient: { clear: () => actions.push("clear") },
		},
		"next/navigation": {
			useRouter: () => ({
				replace: (path: string) => actions.push(path),
				refresh: () => actions.push("refresh"),
			}),
		},
		"next/link": { __esModule: true, default: "a" },
		"next-themes": {
			useTheme: () => ({
				theme: "light",
				setTheme: (value: string) => actions.push(value),
			}),
		},
		"lucide-react": new Proxy({}, { get: (_, name) => String(name) }),
		"@/utils/request-error": { queryErrorMessage },
		"../../components/event-feedback": feedback,
		"../auth/password-change-form": {
			__esModule: true,
			default: "PasswordChangeForm",
		},
	};
	for (const group of ["avatar", "card", "skeleton"]) {
		const names =
			group === "card"
				? ["Card", "CardContent", "CardHeader"]
				: group === "avatar"
					? ["Avatar", "AvatarFallback"]
					: ["Skeleton"];
		mocks[`@resora/ui/components/${group}`] = Object.fromEntries(
			names.map((name) => [name, name]),
		);
		mocks[`@/components/ui/${group}`] = mocks[`@resora/ui/components/${group}`];
	}
	const transport = mocks["@/utils/trpc"] as {
		trpc: unknown;
		getPersonalTrpc?: (userId: string) => unknown;
	};
	transport.getPersonalTrpc = (userId: string) => {
		actions.push(`viewer:${userId}`);
		return transport.trpc;
	};
	mocks["@/components/ui/button"] = { Button: "Button" };
	const code = ts.transpileModule(
		readFileSync(new URL(file, import.meta.url), "utf8"),
		{
			compilerOptions: {
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.CommonJS,
				jsx: ts.JsxEmit.ReactJSX,
			},
		},
	).outputText;
	const exports: Record<string, (props: { userId: string }) => Node> = {};
	new Function("require", "exports", code)((name: string) => {
		if (!(name in mocks)) throw Error(`Missing mock ${name}`);
		return mocks[name];
	}, exports);
	return {
		queries,
		actions,
		setResult: (value: Record<string, unknown>) => {
			result = value;
		},
		render: () => {
			cursor = 0;
			effects = [];
			const tree = exports.default({ userId: "synthetic-user" });
			for (const effect of effects) effect();
			return tree;
		},
	};
}
const identity = {
	actor: "SR",
	name: "Synthetic SR",
	nim: "SYNTHETIC",
	email: null,
	department: "RnD",
	position: "Anggota",
	building: null,
	isActive: true,
};
test("profile shows only available personal fields and unavailable aggregate, without invented periods or scores", () => {
	const f = fixture("../../features/identity/profile/sr-profile.tsx");
	f.setResult({ data: identity });
	const tree = f.render();
	expect(text(tree)).toContain("Ringkasan kehadiran belum tersedia.");
	expect(text(tree)).toContain("Belum tersedia");
	expect(text(tree)).not.toContain("92%");
	expect(nodes(tree).find((node) => node.type === "a")?.props.href).toBe(
		"/attendance/history",
	);
	expect(f.queries[0]?.placeholderData).toBeUndefined();
	expect(f.queries[0]?.refetchOnMount).toBe("always");
	expect(
		nodes(tree).filter((node) => node.type === "PasswordChangeForm"),
	).toHaveLength(1);
	f.setResult({
		data: { ...identity, actor: "SYSTEM_ADMIN", username: "synthetic-admin" },
	});
	const system = f.render();
	expect(text(system)).not.toContain("Kehadiran pribadi");
	expect(text(system)).not.toContain("NIM");
	expect(text(system)).toContain("Username");
	expect(nodes(system).filter((node) => node.type === "a")).toHaveLength(0);
});
test("profile hides cached identity on errors and clears cache before auth redirect", () => {
	const f = fixture("../../features/identity/profile/sr-profile.tsx");
	f.setResult({
		data: identity,
		error: { message: "PASSWORD_CHANGE_REQUIRED", data: { code: "FORBIDDEN" } },
	});
	const tree = f.render();
	expect(text(tree)).not.toContain("Synthetic SR");
	expect(f.actions).toEqual([
		"viewer:synthetic-user",
		"clear",
		"/change-password",
		"refresh",
	]);
	f.setResult({ isPending: true, fetchStatus: "paused" });
	expect(text(f.render())).toContain("Sambungkan internet");
});

const historyItem = {
	event: {
		id: "synthetic-event",
		title: "Kegiatan sintetis",
		status: "CLOSED",
		startsAt: "2026-11-25T23:00:00.000Z",
		endsAt: "2026-11-26T02:00:00.000Z",
	},
	presence: "PRESENT",
	attendanceAt: "2026-11-26T00:30:00.000Z",
	timingClass: "LATE",
	lateMinutes: 5,
	source: "MANUAL",
};
test("own history preserves server presence/timing, WIB and personal pagination without new metrics or user selectors", () => {
	const f = fixture("../../features/attendance/own-history.tsx");
	f.setResult({ data: { items: [historyItem], nextOffset: 25 } });
	let tree = f.render();
	expect(f.queries[0]?.input).toEqual({ offset: 0, limit: 25 });
	expect(f.queries[0]?.refetchOnMount).toBe("always");
	expect(text(tree)).toContain("07.30");
	expect(text(tree)).toContain("WIB");
	expect(text(tree)).toContain("Terlambat 5 menit setelah toleransi");
	expect(text(tree)).toContain("Dicatat manual");
	expect(
		nodes(tree).find((node) => node.type === feedback.StatusBadge)?.props
			.status,
	).toBe("PRESENT");
	expect(nodes(tree).find((node) => node.type === "details")).toBeDefined();
	const next = nodes(tree).find(
		(node) => node.type === "Button" && text(node).includes("Berikutnya"),
	);
	if (!next) throw Error("Next page missing");
	(next.props.onClick as () => void)();
	tree = f.render();
	expect(f.queries.at(-1)?.input).toEqual({ offset: 25, limit: 25 });
	f.setResult({
		data: {
			items: [
				{
					...historyItem,
					attendanceAt: null,
					timingClass: null,
					source: null,
					presence: "ABSENT",
				},
			],
			nextOffset: null,
		},
	});
	tree = f.render();
	expect(text(tree)).toContain("Belum tercatat");
	expect(text(tree)).not.toContain("07.30");
	expect(
		nodes(tree).find((node) => node.type === feedback.StatusBadge)?.props
			.status,
	).toBe("ABSENT");
});
test("own history hides cached rows after errors and separates loading, offline and empty", () => {
	const f = fixture("../../features/attendance/own-history.tsx");
	f.setResult({
		data: { items: [historyItem], nextOffset: 25 },
		error: Error("private failure"),
	});
	let tree = f.render();
	expect(text(tree)).not.toContain(historyItem.event.title);
	expect(nodes(tree).filter((node) => node.type === "nav")).toHaveLength(0);
	f.setResult({ isPending: true, fetchStatus: "paused" });
	tree = f.render();
	expect(text(tree)).toContain("Memuat riwayat");
	expect(text(tree)).toContain("Koneksi terputus");
	f.setResult({ data: { items: [], nextOffset: null } });
	expect(text(f.render())).toContain("Belum ada riwayat kegiatan");
});

test("actual tRPC personal keys isolate accounts without sending identity to the API", async () => {
	const previous = process.env.SERVER_URL;
	process.env.SERVER_URL = "http://127.0.0.1:4101";
	try {
		const { getPersonalTrpc } = await import("../../utils/trpc");
		const a = getPersonalTrpc("synthetic-a");
		const b = getPersonalTrpc("synthetic-b");
		expect(a.identity.profile.queryKey()).not.toEqual(
			b.identity.profile.queryKey(),
		);
		const key = a.attendance.ownHistory.queryKey({ offset: 25, limit: 25 });
		expect(key[1]).toEqual(["attendance", "ownHistory"]);
		expect(key[2]?.input).toEqual({ offset: 25, limit: 25 });
		expect(key).not.toEqual(
			b.attendance.ownHistory.queryKey({ offset: 25, limit: 25 }),
		);
	} finally {
		if (previous === undefined) delete process.env.SERVER_URL;
		else process.env.SERVER_URL = previous;
	}
});
