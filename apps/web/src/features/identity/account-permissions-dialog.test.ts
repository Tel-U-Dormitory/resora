import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { TRPCClientError } from "@trpc/client";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { queryErrorMessage } from "@/utils/request-error";

const entry = {
	code: "ATTENDANCE_MANUAL_MANAGE",
	category: "HCO",
	categoryLabel: "HCO",
	label: "Input & Koreksi Absensi Manual",
	description:
		"Mengizinkan input dan koreksi kehadiran manual serta akses audit terkait.",
	eligibleDepartment: "HCO",
};
const account = {
	userId: "synthetic-hco",
	name: "Synthetic Member",
	nim: "00001",
	departmentCode: "HCO",
	positionCode: "ANGGOTA",
	isActive: true,
};
const initial = {
	target: account,
	catalog: [entry],
	permission: {
		code: entry.code,
		label: entry.label,
		description: entry.description,
		intrinsic: false,
		explicit: false,
		effective: false,
		eligibleForGrant: true,
	},
};
type Element = { type: unknown; key?: string; props: Record<string, unknown> };

// Execute actual TSX with the existing offline React hook/transport-double pattern.
function fixture(file = "./account-permissions-dialog.tsx") {
	let cursor = 0;
	const hooks: unknown[] = [];
	let result: Record<string, unknown> = { data: structuredClone(initial) };
	let failure: unknown;
	let pending: Promise<unknown> | undefined;
	let refreshFailure = false;
	let retries = 0;
	const queries: Record<string, unknown>[] = [];
	const calls: Record<string, unknown>[] = [];
	const invalidations: unknown[] = [];
	const mocks: Record<string, unknown> = {
		"react/jsx-runtime": jsxRuntime,
		react: {
			useState(initial: unknown) {
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
			useRef(initial: unknown) {
				const index = cursor++;
				hooks[index] ??= { current: initial };
				return hooks[index];
			},
		},
		"@tanstack/react-query": {
			useQuery(options: Record<string, unknown>) {
				queries.push(options);
				return {
					isFetchedAfterMount: true,
					isError: false,
					refetch: () => {
						retries++;
					},
					...result,
				};
			},
		},
		"@trpc/client": { TRPCClientError },
		"@/utils/request-error": { queryErrorMessage },
		"@/utils/trpc": {
			trpc: {
				identity: {
					accountPermissions: {
						queryOptions: (input: unknown) => ({
							input,
							queryKey: ["identity", "accountPermissions", input],
						}),
					},
				},
			},
			trpcClient: {
				identity: {
					setAccountPermission: {
						mutate: async (input: Record<string, unknown>) => {
							calls.push(input);
							if (pending) await pending;
							if (failure) throw failure;
							const data = result.data as typeof initial;
							return {
								...data,
								changed: true,
								permission: {
									...data.permission,
									explicit: input.enabled,
									effective: input.enabled,
								},
							};
						},
					},
				},
			},
			queryClient: {
				setQueryData(_key: unknown, data: unknown) {
					result = { ...result, data };
				},
				async invalidateQueries(input: unknown) {
					invalidations.push(input);
					if (refreshFailure) throw Error("Synthetic refresh failure");
				},
			},
		},
		"./account-modal": { AccountModal: "AccountModal" },
		"./account-password-reset": {
			__esModule: true,
			default: "AccountPasswordReset",
		},
		"./account-permissions-dialog": {
			__esModule: true,
			default: "AccountPermissionsDialog",
		},
		"@/components/ui/button": { Button: "Button" },
		"lucide-react": {
			Pencil: "Pencil",
			Trash2: "Trash2",
			ShieldCheck: "ShieldCheck",
		},
	};
	for (const name of ["Checkbox", "Label", "Input", "Select"])
		mocks[`@resora/ui/components/${name.toLowerCase()}`] = { [name]: name };
	mocks["@resora/ui/components/tooltip"] = {
		Tooltip: "Tooltip",
		TooltipTrigger: "TooltipTrigger",
		TooltipContent: "TooltipContent",
	};
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
	const exports: { default?: (props: Record<string, unknown>) => Element } = {};
	new Function("require", "exports", js)((name: string) => {
		if (!(name in mocks)) throw Error(`Missing double: ${name}`);
		return mocks[name];
	}, exports);
	return {
		calls,
		queries,
		invalidations,
		query(value: Record<string, unknown>) {
			result = { ...result, ...value };
		},
		fail(error: unknown) {
			failure = error;
		},
		block(value: Promise<unknown>) {
			pending = value;
		},
		failRefresh() {
			refreshFailure = true;
		},
		retries: () => retries,
		render(
			props: Record<string, unknown> = { userId: account.userId, onClose() {} },
		) {
			cursor = 0;
			if (!exports.default) throw Error("Missing component");
			return exports.default(props);
		},
	};
}
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [
		element,
		...nodes(element.props.children),
		...nodes(element.props.render),
	];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join(" ");
	if (value && typeof value === "object" && "props" in value)
		return text((value as Element).props.children);
	return typeof value === "string" ? value : "";
}
function node(tree: Element, type: string) {
	const found = nodes(tree).find((item) => item.type === type);
	if (!found) throw Error(`Missing ${type}`);
	return found;
}
function toggle(tree: Element, enabled: boolean, id?: string) {
	const control = nodes(tree).find(
		(item) => item.type === "Checkbox" && (!id || item.props.id === id),
	);
	if (!control) throw Error("Missing control");
	(control.props.onCheckedChange as (checked: boolean) => void)(enabled);
}
function submit(tree: Element) {
	return (
		node(tree, "form").props.onSubmit as (event: {
			preventDefault(): void;
		}) => Promise<void>
	)({ preventDefault() {} });
}

test("account action preserves edit/archive/password reset and opens a target-keyed permission dialog", () => {
	const f = fixture("./account-actions.tsx");
	const render = () => f.render({ account });
	let tree = render();
	expect(nodes(tree).some((item) => item.type === "AccountPasswordReset")).toBe(
		true,
	);
	expect(
		nodes(tree)
			.filter((item) => item.type === "Button")
			.map((item) => item.props["aria-label"]),
	).toEqual([
		`Edit ${account.name}`,
		`Hapus dan arsipkan ${account.name}`,
		`Kelola Hak Akses ${account.name} (${account.nim})`,
	]);
	expect(
		nodes(tree).some((item) => item.type === "AccountPermissionsDialog"),
	).toBe(false);
	const action = nodes(tree).find((item) =>
		String(item.props["aria-label"]).startsWith("Kelola Hak"),
	);
	if (!action) throw Error("Missing permission action");
	(action.props.onClick as () => void)();
	tree = render();
	const dialog = node(tree, "AccountPermissionsDialog");
	expect(dialog.key).toBe(account.userId);
	expect(dialog.props.userId).toBe(account.userId);
	(dialog.props.onClose as () => void)();
	expect(
		nodes(render()).some((item) => item.type === "AccountPermissionsDialog"),
	).toBe(false);
	expect(f.calls).toHaveLength(0);
});
test("fresh target-scoped reads show loading/error/retry and never display another target or stale reopen data", () => {
	const f = fixture();
	f.query({ isFetchedAfterMount: false });
	expect(text(f.render())).toContain("Memuat hak akses");
	expect(nodes(f.render()).some((item) => item.type === "Checkbox")).toBe(
		false,
	);
	f.query({
		isFetchedAfterMount: true,
		isError: true,
		error: new TRPCClientError("SUPERADMIN_REQUIRED"),
	});
	let tree = f.render();
	expect(text(tree)).toContain("Hanya Super Admin");
	(node(tree, "Button").props.onClick as () => void)();
	expect(f.retries()).toBe(1);
	f.query({ isError: false });
	tree = f.render({ userId: "another-user", onClose() {} });
	expect(text(tree)).not.toContain(account.name);
	expect(nodes(tree).some((item) => item.type === "Checkbox")).toBe(false);
	expect(f.queries.at(-1)).toMatchObject({
		input: { userId: "another-user" },
		queryKey: ["identity", "accountPermissions", { userId: "another-user" }],
		staleTime: 0,
		refetchOnMount: "always",
		retry: false,
	});
	expect(f.calls).toHaveLength(0);
});
test("server catalog supplies grouping and target identity; intrinsic permission is checked read-only", () => {
	const f = fixture();
	f.query({
		data: {
			...initial,
			catalog: [{ ...entry, categoryLabel: "Server-defined grouping" }],
			permission: {
				...initial.permission,
				intrinsic: true,
				eligibleForGrant: false,
				effective: true,
			},
		},
	});
	const tree = f.render();
	expect(tree.props.description).toBe(
		`Atur izin tambahan untuk ${account.name} (${account.nim}).`,
	);
	expect(text(tree)).toContain("Server-defined grouping");
	expect(text(tree)).toContain("Izin bawaan jabatan");
	expect(node(tree, "Checkbox").props).toMatchObject({
		checked: true,
		disabled: true,
	});
	expect(node(tree, "Button").props.disabled).toBe(true);
});
test("eligible HCO grant saves once, blocks close and duplicate submission, then refreshes only this target", async () => {
	const f = fixture();
	let closed = 0;
	const render = () =>
		f.render({
			userId: account.userId,
			onClose() {
				closed++;
			},
		});
	toggle(render(), true);
	let release = () => {};
	f.block(
		new Promise<void>((resolve) => {
			release = resolve;
		}),
	);
	const request = submit(render());
	await submit(render());
	const tree = render();
	expect(tree.props.busy).toBe(true);
	expect(node(tree, "Button").props.disabled).toBe(true);
	(tree.props.onClose as () => void)();
	expect(closed).toBe(0);
	expect(f.calls).toEqual([
		{ userId: account.userId, permissionCode: entry.code, enabled: true },
	]);
	release();
	await request;
	expect(text(render())).toContain("Hak akses berhasil diperbarui");
	expect(node(render(), "Checkbox").props.checked).toBe(true);
	expect(f.invalidations).toEqual([
		{
			queryKey: ["identity", "accountPermissions", { userId: account.userId }],
		},
	]);
	(render().props.onClose as () => void)();
	expect(closed).toBe(1);
});
test("eligible HCO revocation requires inline confirmation and cancel keeps the selected change", async () => {
	const f = fixture();
	f.query({
		data: {
			...initial,
			permission: { ...initial.permission, explicit: true, effective: true },
		},
	});
	toggle(f.render(), false);
	await submit(f.render());
	expect(f.calls).toHaveLength(0);
	expect(text(f.render())).toContain(
		`Cabut izin ${entry.label} dari ${account.name}?`,
	);
	expect(text(f.render())).toContain("tanpa perlu logout");
	const cancel = nodes(f.render()).find(
		(item) => item.type === "Button" && text(item) === "Batal",
	);
	if (!cancel) throw Error("Missing confirmation cancel");
	(cancel.props.onClick as () => void)();
	expect(text(f.render())).not.toContain("Cabut izin Input");
	expect(node(f.render(), "Checkbox").props.checked).toBe(false);
	await submit(f.render());
	await submit(f.render());
	expect(f.calls).toEqual([
		{ userId: account.userId, permissionCode: entry.code, enabled: false },
	]);
});
test("non-HCO has no categories and old explicit grant is revocable only through neutral cleanup", async () => {
	const f = fixture();
	const data = {
		...initial,
		target: { ...account, departmentCode: "RND" },
		catalog: [],
		permission: { ...initial.permission, eligibleForGrant: false },
	};
	f.query({ data });
	expect(text(f.render())).toContain("Belum ada hak akses tambahan");
	expect(nodes(f.render()).some((item) => item.type === "fieldset")).toBe(
		false,
	);
	f.query({
		data: { ...data, permission: { ...data.permission, explicit: true } },
	});
	expect(text(f.render())).toContain("Izin lama tidak berlaku");
	expect(
		nodes(f.render())
			.filter((item) => item.type === "legend")
			.map(text),
	).toEqual(["Izin lama tidak berlaku"]);
	toggle(f.render(), false);
	await submit(f.render());
	await submit(f.render());
	expect(f.calls[0]?.enabled).toBe(false);
});
test("ineligible HCO cannot receive grants but may revoke an existing explicit grant", async () => {
	for (const explicit of [false, true]) {
		const f = fixture();
		f.query({
			data: {
				...initial,
				target: { ...account, isActive: false },
				permission: {
					...initial.permission,
					eligibleForGrant: false,
					explicit,
				},
			},
		});
		expect(text(f.render())).toContain("Akun tidak aktif");
		expect(text(f.render())).toContain("HCO");
		expect(node(f.render(), "Checkbox").props.disabled).toBe(!explicit);
		if (explicit) {
			toggle(f.render(), false);
			await submit(f.render());
			await submit(f.render());
			expect(f.calls[0]?.enabled).toBe(false);
		} else {
			toggle(f.render(), true);
			await submit(f.render());
			expect(f.calls).toHaveLength(0);
		}
	}
});
test("promotion to intrinsic access permits cleanup of the old explicit grant without toggling intrinsic access", async () => {
	const f = fixture();
	f.query({
		data: {
			...initial,
			permission: {
				...initial.permission,
				intrinsic: true,
				explicit: true,
				effective: true,
				eligibleForGrant: false,
			},
		},
	});
	expect(node(f.render(), "Checkbox").props).toMatchObject({
		checked: true,
		disabled: true,
	});
	expect(text(f.render())).toContain("Izin eksplisit tersimpan");
	toggle(f.render(), false, "old-permission");
	await submit(f.render());
	await submit(f.render());
	expect(f.calls[0]?.enabled).toBe(false);
	expect(node(f.render(), "Checkbox").props).toMatchObject({
		checked: true,
		disabled: true,
	});
});
test("failed mutations retain selection, sanitize errors and refresh on revoked admin, eligibility and intrinsic conflicts", async () => {
	for (const message of [
		"SUPERADMIN_REQUIRED",
		"PERMISSION_TARGET_INELIGIBLE",
		"PERMISSION_ALREADY_INTRINSIC",
		"SQL PRIVATE DETAILS",
	]) {
		const f = fixture();
		toggle(f.render(), true);
		f.fail(new TRPCClientError(message));
		await submit(f.render());
		expect(node(f.render(), "Checkbox").props.checked).toBe(true);
		expect(text(f.render())).not.toContain("SQL PRIVATE DETAILS");
		expect(text(f.render())).not.toContain("berhasil");
		expect(nodes(f.render()).some((item) => item.props.role === "alert")).toBe(
			true,
		);
		expect(f.invalidations).toHaveLength(1);
	}
});
test("department changes and concurrent revocation refresh controls without regranting or losing selection", async () => {
	const f = fixture();
	toggle(f.render(), true);
	f.query({
		data: {
			...initial,
			catalog: [],
			target: { ...account, departmentCode: "MEDIA" },
			permission: { ...initial.permission, eligibleForGrant: false },
		},
	});
	await submit(f.render());
	expect(f.calls).toHaveLength(0);
	expect(node(f.render(), "Button").props.disabled).toBe(true);
	const revoke = fixture();
	revoke.query({
		data: { ...initial, permission: { ...initial.permission, explicit: true } },
	});
	toggle(revoke.render(), false);
	await submit(revoke.render());
	revoke.query({ data: initial });
	await submit(revoke.render());
	expect(revoke.calls).toHaveLength(0);
});
test("write success remains visible if status refresh fails, with an explicit refresh warning", async () => {
	const f = fixture();
	f.failRefresh();
	toggle(f.render(), true);
	await submit(f.render());
	f.query({
		isError: true,
		error: new TRPCClientError("Synthetic refresh failure"),
	});
	expect(text(f.render())).toContain("Hak akses berhasil diperbarui");
	expect(text(f.render())).toContain("Status terbaru belum dapat dimuat");
});
