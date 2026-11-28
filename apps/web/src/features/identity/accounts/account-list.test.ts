import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import { queryErrorMessage } from "../../../utils/request-error";
import * as status from "./account-status";

type Element = { type: unknown; props: Record<string, unknown> };
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join(" ");
	if (typeof value === "string" || typeof value === "number")
		return String(value);
	return value && typeof value === "object"
		? text((value as Element).props.children)
		: "";
}
function fixture(file: string) {
	let failure: unknown;
	const record = {
		userId: "synthetic-sr",
		name: "Synthetic private account",
		nim: "SYNTHETIC",
		email: "fixture@example.invalid",
		departmentCode: "RND",
		department: "RnD",
		positionCode: "ANGGOTA",
		position: "Anggota",
		buildingCode: "A",
		building: "Gedung sintetis",
		isActive: true,
		isSuperadmin: false,
		periods: [],
	};
	const mocks: Record<string, unknown> = {
		"react/jsx-runtime": jsx,
		react: {
			useEffect: () => {},
			useState: (initial: unknown) => [
				typeof initial === "function" ? initial() : initial,
				() => {},
			],
		},
		"@tanstack/react-query": {
			useQuery: (options: { kind: string }) =>
				options.kind === "references"
					? { data: { departments: [] } }
					: { data: { accounts: [record] }, error: failure, isPending: false },
		},
		"@/utils/trpc": {
			trpc: {
				identity: {
					accountReferences: { queryOptions: () => ({ kind: "references" }) },
					accountSnapshot: { queryOptions: () => ({ kind: "snapshot" }) },
				},
			},
			queryClient: {},
		},
		"@/utils/request-error": { queryErrorMessage },
		"./account-status": status,
		"./account-actions": { __esModule: true, default: "AccountActions" },
		"./account-period-manager": {
			__esModule: true,
			default: "AccountPeriodManager",
		},
		"./account-dt-panel": {
			__esModule: true,
			default: "AccountDtPanel",
		},
		"next/link": { __esModule: true, default: "Link" },
		"lucide-react": { ChevronLeft: "ChevronLeft", Plus: "Plus", UserCog: "UserCog" },
		"@/components/ui/button": { Button: "Button" },
		"@/components/ui/card": { Card: "Card", CardContent: "CardContent" },
		"@/components/ui/tabs": {
			Tabs: "Tabs",
			TabsList: "TabsList",
			TabsTrigger: "TabsTrigger",
		},
		"@/components/empty-state": { EmptyState: "EmptyState" },
	};
	for (const name of ["Input", "Label", "Select", "Checkbox"])
		mocks[`@resora/ui/components/${name.toLowerCase()}`] = { [name]: name };
	const code = ts.transpileModule(
		readFileSync(new URL(file, import.meta.url), "utf8"),
		{
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				jsx: ts.JsxEmit.ReactJSX,
				target: ts.ScriptTarget.ES2022,
			},
		},
	).outputText;
	const exports: Record<string, () => Element> = {};
	new Function("require", "exports", code)((name: string) => {
		if (!(name in mocks)) throw Error(`Missing mock ${name}`);
		return mocks[name];
	}, exports);
	return {
		render: () => exports.default(),
		fail: () => {
			failure = Error("private storage failure");
		},
	};
}
for (const file of ["./account-list.tsx", "../periods/period-workspace.tsx"]) {
	test(`${file} hides cached private records and counts when the authoritative read fails`, () => {
		const f = fixture(file);
		expect(text(f.render())).toContain("Synthetic private account");
		f.fail();
		const result = text(f.render());
		expect(result).not.toContain("Synthetic private account");
		expect(result).not.toContain("fixture@example.invalid");
		expect(result).not.toContain("private storage failure");
		expect(result).not.toContain("0 akun");
		expect(result).toContain("Coba kembali");
	});
}

test("./account-list.tsx exposes separate Akun SR and Akun DT tabs and AccountDtPanel renders DT accounts by building", () => {
	const listSource = text(fixture("./account-list.tsx").render());
	expect(listSource).toContain("Akun SR");
	expect(listSource).toContain("Akun DT");

	const dtAccount = {
		userId: "dt-user-1",
		updatedAt: new Date("2026-11-28T00:00:00Z"),
		nim: "1301990001",
		name: "Andi Dorm Team",
		email: "andi.dt@example.invalid",
		isActive: true,
		mustChangePassword: false,
		membershipId: "00000000-0000-4000-8000-000000000001",
		periodName: "2026/2027",
		membershipStatus: "ACTIVE",
		startsOn: "2026-01-01",
		endsOn: "2026-12-31",
		buildingId: "00000000-0000-4000-8000-000000000002",
		buildingCode: "A",
		buildingName: "Gedung A",
		workProgram: "Pendampingan Maba",
	};
	const mocks: Record<string, unknown> = {
		"react/jsx-runtime": jsx,
		react: {
			useRef: (initial: unknown) => ({ current: initial }),
			useState: (initial: unknown) => [
				typeof initial === "function" ? initial() : initial,
				() => {},
			],
		},
		"@tanstack/react-query": {
			useQuery: () => ({
				data: {
					accounts: [dtAccount],
					buildings: [{ id: dtAccount.buildingId, code: "A", name: "Gedung A" }],
				},
				error: null,
				isPending: false,
				isFetching: false,
			}),
		},
		"@/utils/trpc": {
			trpc: {
				dt: {
					adminListAccounts: {
						queryOptions: () => ({ kind: "dt-accounts" }),
						pathKey: () => ["dt", "adminListAccounts"],
					},
					pathKey: () => ["dt"],
				},
			},
			trpcClient: {},
			queryClient: {},
		},
		"@/utils/request-error": { queryErrorMessage },
		"./account-modal": { AccountModal: "AccountModal" },
		"next/link": { __esModule: true, default: "Link" },
		"lucide-react": {
			Check: "Check",
			Copy: "Copy",
			KeyRound: "KeyRound",
			Pencil: "Pencil",
			Trash2: "Trash2",
			UserCog: "UserCog",
		},
		"@/components/ui/button": { Button: "Button" },
		"@/components/ui/card": { Card: "Card", CardContent: "CardContent" },
		"@/components/empty-state": { EmptyState: "EmptyState" },
		"@resora/ui/components/tooltip": {
			Tooltip: "Tooltip",
			TooltipContent: "TooltipContent",
			TooltipTrigger: "TooltipTrigger",
		},
	};
	for (const name of ["Input", "Label", "Select", "Checkbox"])
		mocks[`@resora/ui/components/${name.toLowerCase()}`] = { [name]: name };
	const code = ts.transpileModule(
		readFileSync(new URL("./account-dt-panel.tsx", import.meta.url), "utf8"),
		{
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				jsx: ts.JsxEmit.ReactJSX,
				target: ts.ScriptTarget.ES2022,
			},
		},
	).outputText;
	const exports: Record<string, () => Element> = {};
	new Function("require", "exports", code)((name: string) => {
		if (!(name in mocks)) throw Error(`Missing mock ${name}`);
		return mocks[name];
	}, exports);
	const rendered = text(exports.default());
	expect(rendered).toContain("Andi Dorm Team");
	expect(rendered).toContain("Gedung A");
	expect(rendered).not.toContain("Semua departemen");
});
