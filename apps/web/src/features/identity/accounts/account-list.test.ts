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
		"next/link": { __esModule: true, default: "Link" },
		"lucide-react": { Plus: "Plus" },
		"@/components/ui/button": { Button: "Button" },
		"@/components/ui/card": { Card: "Card", CardContent: "CardContent" },
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
