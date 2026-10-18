import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { cache } from "react";
import ts from "typescript";
import { parseWibDateTimeInput, toWibDateTimeInput } from "./event-ui";

// Execute the actual JSX callbacks with small UI/API doubles, without a browser or DB.
function jsxCallback(file: string, attribute: string, contains = "") {
	const source = ts.createSourceFile(
		file,
		readFileSync(new URL(file, import.meta.url), "utf8"),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	let expression: ts.Expression | undefined;
	function visit(node: ts.Node) {
		if (
			ts.isJsxAttribute(node) &&
			node.name.getText(source) === attribute &&
			node.initializer &&
			ts.isJsxExpression(node.initializer)
		) {
			const candidate = node.initializer.expression;
			if (
				!expression &&
				candidate &&
				candidate.getText(source).includes(contains)
			)
				expression = candidate;
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	if (!expression) throw new Error("Expected JSX callback missing");
	return expression.getText(source);
}
function compile<T>(expression: string, scope: Record<string, unknown>): T {
	const js = ts.transpileModule(`const handler = ${expression};`, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
	}).outputText;
	return new Function(...Object.keys(scope), `${js}\nreturn handler;`)(
		...Object.values(scope),
	) as T;
}
type SubmitEvent = { preventDefault: () => void };
const event: SubmitEvent = { preventDefault: () => {} };
type Submit = (event: SubmitEvent) => Promise<void>;

function loginFixture() {
	const observed = {
		status: "idle",
		error: "",
		calls: 0,
		clears: 0,
		paths: [] as string[],
	};
	const submitting = { current: false };
	const scope = {
		submitting,
		setStatus: (value: string) => {
			observed.status = value;
		},
		setError: (value: string) => {
			observed.error = value;
		},
		nim: "synthetic.username",
		password: "synthetic-only-password",
		authClient: {
			signIn: {
				username: async () => {
					observed.calls++;
					return { error: null as { status: number } | null };
				},
			},
		},

		queryClient: {
			clear: () => {
				observed.clears++;
			},
		},
		window: {
			location: {
				replace: (path: string) => {
					observed.paths.push(path);
				},
			},
		},
	};
	const submit = () =>
		compile<Submit>(
			jsxCallback("../identity/login-form.tsx", "onSubmit"),
			scope,
		);
	return { observed, submitting, scope, submit };
}

test("login stays pending through sign-in and fresh SSR navigation without a client identity fetch", async () => {
	const fixture = loginFixture();
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	fixture.scope.authClient.signIn.username = async () => {
		fixture.observed.calls++;
		await gate;
		return { error: null };
	};
	const submit = fixture.submit();
	const first = submit(event);
	expect(fixture.observed.status).toBe("processing");
	await submit(event);
	expect(fixture.observed.calls).toBe(1);
	release();
	await first;
	expect(fixture.observed.status).toBe("redirecting");
	expect(fixture.submitting.current).toBe(true);
	expect(fixture.observed.paths).toEqual(["/dashboard"]);
	expect(fixture.observed.clears).toBe(1);
	await submit(event);
	expect(fixture.observed.calls).toBe(1);
	expect(fixture.observed.error).toBe("");
	const source = readFileSync(
		new URL("../identity/login-form.tsx", import.meta.url),
		"utf8",
	);
	expect(source).not.toContain("fetchQuery");
	expect(source).not.toContain("trpc.identity");
	expect(source).not.toContain("router.refresh");
});

test("login resets pending on credential, rate-limit, service, navigation and network failures", async () => {
	for (const failure of [
		"credentials",
		"rate",
		"service",
		"navigation",
		"network",
	]) {
		const fixture = loginFixture();
		if (failure === "navigation")
			fixture.scope.window.location.replace = () => {
				throw new Error("Synthetic navigation failure");
			};
		else
			fixture.scope.authClient.signIn.username = async () => {
				if (failure === "network")
					throw new Error("Synthetic unavailable service");
				return {
					error: {
						status:
							failure === "rate" ? 429 : failure === "service" ? 503 : 401,
					},
				};
			};
		await fixture.submit()(event);
		expect(fixture.observed.status).toBe("idle");
		expect(fixture.submitting.current).toBe(false);
		expect(fixture.observed.paths).toEqual([]);
		expect(fixture.observed.error.length).toBeGreaterThan(0);
		expect(fixture.observed.error).not.toContain(fixture.scope.password);
	}
});

test("event editor submits only permitted advanced fields, requires a reason and retains draft behavior", async () => {
	for (const advancedMode of [
		undefined,
		"FULL",
		"LIMITED",
		"METADATA",
	] as const) {
		for (const changedEnd of [false, true]) {
			const calls: { kind: string; input: Record<string, unknown> }[] = [];
			const initial = {
				startsAt: "2030-10-12T06:00:15.123Z",
				// Existing sub-minute events must remain metadata-editable without rounding their schedule.
				endsAt: advancedMode
					? "2030-10-12T06:00:16.456Z"
					: "2030-10-12T08:00:16.456Z",
			};
			const observed = { saving: false, error: "", path: "", refreshes: 0 };
			const mutation = (kind: string) => ({
				mutateAsync: async (input: Record<string, unknown>) => {
					calls.push({ kind, input });
				},
			});
			const scope = {
				advancedMode,
				initial,
				eventId: "synthetic-event",
				submitLock: { current: false },
				draft: {
					title: "Synthetic event",
					description: "Description",
					rosterCriteria: {},
					session: {},
				},
				start: toWibDateTimeInput(initial.startsAt),
				end: changedEnd
					? "2030-10-12T16:30"
					: toWibDateTimeInput(initial.endsAt),
				reason: "Administrative correction",
				parseWibDateTimeInput,
				toWibDateTimeInput,
				setError: (value: string) => {
					observed.error = value;
				},
				setEndError: (value: string) => {
					observed.error = value;
				},
				setSaving: (value: boolean) => {
					observed.saving = value;
				},
				advanced: mutation("advanced"),
				edit: mutation("draft"),
				create: mutation("create"),
				queryClient: {},
				attendanceQueryKeys: {},
				refreshAttendanceQueries: async () => {
					observed.refreshes++;
				},
				router: {
					push: (path: string) => {
						observed.path = path;
					},
				},
				eventErrorMessage: () => "Perubahan ditolak.",
				timeRangeMessage: "Waktu tidak valid.",
			};
			const submit = () =>
				compile<Submit>(jsxCallback("event-form.tsx", "onSubmit"), scope);
			if (advancedMode) {
				scope.reason = " ";
				await submit()(event);
				expect(calls).toHaveLength(0);
				expect(observed.error).toContain("Alasan");
				expect(observed.saving).toBe(false);
				scope.reason = "Administrative correction";
			}
			await submit()(event);
			expect(calls).toHaveLength(1);
			expect(observed.error).toBe("");
			expect(observed.refreshes).toBe(1);
			expect(observed.path).toBe("/events/synthetic-event");
			const call = calls[0];
			if (!call) throw new Error("Expected mutation");
			expect(call.kind).toBe(advancedMode ? "advanced" : "draft");
			if (advancedMode === "LIMITED" || advancedMode === "METADATA") {
				expect(Object.keys(call.input).sort()).toEqual(
					[
						"description",
						"eventId",
						"mode",
						"reason",
						"title",
						...(advancedMode === "LIMITED" && changedEnd ? ["endsAt"] : []),
					].sort(),
				);
			} else if (advancedMode === "FULL") {
				expect(call.input).toMatchObject({
					mode: "FULL",
					reason: scope.reason,
					draft: {
						startsAt: initial.startsAt,
						endsAt: changedEnd ? "2030-10-12T09:30:00.000Z" : initial.endsAt,
					},
				});
			}
			await submit()(event);
			expect(calls).toHaveLength(1);
			// A failed mutation releases the submission lock and shows a local error.
			scope.submitLock.current = false;
			scope.advanced.mutateAsync = scope.edit.mutateAsync = async () => {
				throw new Error("Synthetic rejection");
			};
			await submit()(event);
			expect(observed.error).toBe("Perubahan ditolak.");
			expect(scope.submitLock.current).toBe(false);
			expect(observed.saving).toBe(false);
		}
	}
	const source = readFileSync(
		new URL("event-form.tsx", import.meta.url),
		"utf8",
	);
	expect(source).toContain('advancedMode !== "METADATA"');
	expect(source).toContain("{fullEditing && (");
	const detail = readFileSync(
		new URL("event-detail.tsx", import.meta.url),
		"utf8",
	);
	expect(detail).toContain("detail.data.advancedEditMode");
	expect(detail).toContain("metadata.mutateAsync");
});

test("visibility/deletion UI requires reason and confirmation, respects pending state and selects the existing mutation", async () => {
	for (const action of [
		"HIDE",
		"UNHIDE",
		"ARCHIVE",
		"RESTORE",
		"DELETE_DRAFT",
	]) {
		const calls: { kind: string; input: unknown }[] = [];
		const jobs: Promise<unknown>[] = [];
		let confirmed = false;
		let feedback = "";
		const scope = {
			busy: false,
			administrativeAction: action,
			administrativeOptions: [action],
			administrativeReason: " ",
			eventId: "synthetic-event",
			event: { title: "Synthetic draft" },
			administrativeLabels: { [action]: "Synthetic action" },
			window: {
				confirm: (message: string) => {
					expect(message).toContain("Synthetic draft");
					return confirmed;
				},
			},
			setError: (value: string) => {
				feedback = value;
			},
			setAdministrativeAction: (value: string) => {
				scope.administrativeAction = value;
			},
			setAdministrativeReason: (value: string) => {
				scope.administrativeReason = value;
			},
			visibility: {
				mutateAsync: async (input: unknown) => {
					calls.push({ kind: "visibility", input });
				},
			},
			deleteDraft: {
				mutateAsync: async (input: unknown) => {
					calls.push({ kind: "delete", input });
				},
			},
			act: (
				_kind: string,
				_message: string,
				operation: () => Promise<unknown>,
			) => {
				jobs.push(operation());
			},
		};
		const submit = () =>
			compile<(event: SubmitEvent) => void>(
				jsxCallback("event-detail.tsx", "onSubmit", "administrativeOptions"),
				scope,
			)(event);
		submit();
		expect(feedback).toContain("Alasan");
		expect(calls).toHaveLength(0);
		scope.administrativeReason = "Synthetic reason";
		submit();
		expect(calls).toHaveLength(0); // Native confirmation cancelled.
		confirmed = true;
		scope.busy = true;
		submit();
		expect(calls).toHaveLength(0);
		scope.busy = false;
		submit();
		await Promise.all(jobs);
		expect(calls).toEqual([
			{
				kind: action === "DELETE_DRAFT" ? "delete" : "visibility",
				input: {
					eventId: scope.eventId,
					reason: "Synthetic reason",
					...(action !== "DELETE_DRAFT" ? { action } : {}),
				},
			},
		]);
		expect(scope.administrativeAction).toBe("");
		expect(scope.administrativeReason).toBe("");
	}
	const detail = readFileSync(
		new URL("event-detail.tsx", import.meta.url),
		"utf8",
	);
	expect(detail).toContain("{administration && (");
	expect(detail).toContain('disabled={busy || event.visibility !== "VISIBLE"}');
	const list = readFileSync(new URL("event-list.tsx", import.meta.url), "utf8");
	expect(list).toContain("management && query.data?.isSuperadmin");
	expect(list).toContain('event.visibility === "VISIBLE"');
});

test("successful DRAFT deletion redirects without refetching deleted detail; failure retains retry feedback", async () => {
	const source = ts.createSourceFile(
		"event-detail.tsx",
		readFileSync(new URL("event-detail.tsx", import.meta.url), "utf8"),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	let expression = "";
	function visit(node: ts.Node) {
		if (ts.isVariableDeclaration(node) && node.name.getText(source) === "act")
			expression = node.initializer?.getText(source) ?? "";
		ts.forEachChild(node, visit);
	}
	visit(source);
	for (const failure of [false, true]) {
		const paths: string[] = [];
		const invalidations: unknown[] = [];
		let error = "";
		const scope = {
			actionLock: { current: false },
			eventId: "synthetic-event",
			setActiveAction: () => {},
			setFeedback: () => {},
			setError: (value: string) => {
				error = value;
			},
			attendanceQueryKeys: { all: ["attendance"] },
			queryClient: {
				cancelQueries: async () => {},
				invalidateQueries: async (input: unknown) => {
					invalidations.push(input);
				},
			},
			router: {
				replace: (path: string) => {
					paths.push(path);
				},
			},
			refreshAttendanceQueries: async () => {
				throw new Error("Deleted detail must not refetch");
			},
			eventErrorMessage: () =>
				"Permintaan belum berhasil. Muat ulang sebelum mencoba kembali.",
		};
		const act = compile<
			(
				kind: string,
				message: string,
				operation: () => Promise<void>,
			) => Promise<void>
		>(expression, scope);
		await act("deleteDraft", "Draft dihapus", async () => {
			if (failure) throw new Error("Synthetic failure");
		});
		expect(paths).toEqual(failure ? [] : ["/events?view=manage"]);
		expect(invalidations).toEqual(
			failure ? [] : [{ queryKey: ["attendance"], refetchType: "none" }],
		);
		expect(Boolean(error)).toBe(failure);
		expect(scope.actionLock.current).toBe(false);
	}
});

test("dialog Escape closes only when idle; native modal opening/focus/cleanup remain explicit", () => {
	for (const busy of [false, true]) {
		let closes = 0;
		let prevented = false;
		const cancel = compile<(event: SubmitEvent) => void>(
			jsxCallback("event-recap.tsx", "onCancel"),
			{
				busy,
				onClose: () => {
					closes++;
				},
			},
		);
		cancel({
			preventDefault: () => {
				prevented = true;
			},
		});
		expect(prevented).toBe(true);
		expect(closes).toBe(busy ? 0 : 1);
	}
	const text = readFileSync(
		new URL("event-recap.tsx", import.meta.url),
		"utf8",
	);
	for (const markup of [
		"dialog.showModal()",
		"dialog.close()",
		'aria-labelledby="recap-dialog-title"',
		"participant.name",
		"participant.nim",
		"participant.departmentCode",
		"participant.positionCode",
		"participant.buildingName",
		"disabled={busy}",
		"busy={busy}",
	])
		expect(text).toContain(markup);
	expect(text).toContain('querySelector<HTMLInputElement>("input")?.focus()');
});

test("manual dialog keeps closed-time/reason validation, original API payloads, failure feedback and submit lock", async () => {
	for (const scenario of [
		"blank-reason",
		"closed-no-time",
		"published",
		"closed",
		"correction",
		"failure",
	]) {
		const calls: { kind: string; input: Record<string, unknown> }[] = [];
		const observed = { error: "", saved: false, saving: false };
		const scope = {
			submitLock: { current: false },
			reason: scenario === "blank-reason" ? " " : "Synthetic reason",
			time: ["closed", "correction"].includes(scenario)
				? "2026-10-14T10:00"
				: "",
			closed: scenario.startsWith("closed"),
			participant: {
				userId: "synthetic-target",
				attendanceId: scenario === "correction" ? "synthetic-record" : null,
			},
			eventId: "synthetic-event",
			setError: (value: string) => {
				observed.error = value;
			},
			setSaving: (value: boolean) => {
				observed.saving = value;
			},
			parseWibDateTimeInput,
			manualError: () => "Penyimpanan gagal.",
			onDone: async () => {
				observed.saved = true;
			},
			insert: {
				mutateAsync: async (input: Record<string, unknown>) => {
					if (scenario === "failure") throw new Error("Synthetic failure");
					calls.push({ kind: "insert", input });
				},
			},
			correct: {
				mutateAsync: async (input: Record<string, unknown>) => {
					calls.push({ kind: "correct", input });
				},
			},
		};
		const submit = compile<Submit>(
			jsxCallback("event-recap.tsx", "onSubmit"),
			scope,
		);
		await submit(event);
		expect(observed.saving).toBe(false);
		expect(scope.submitLock.current).toBe(false);
		if (["blank-reason", "closed-no-time", "failure"].includes(scenario)) {
			expect(calls).toHaveLength(0);
			expect(observed.error.length).toBeGreaterThan(0);
			expect(observed.saved).toBe(false);
		} else {
			expect(calls).toHaveLength(1);
			expect(observed.saved).toBe(true);
			expect(calls[0]?.kind).toBe(
				scenario === "correction" ? "correct" : "insert",
			);
			expect(calls[0]?.input.attendanceAt).toBe(
				scenario === "published" ? undefined : "2026-10-14T03:00:00.000Z",
			);
		}
		scope.submitLock.current = true;
		await submit(event);
		expect(calls.length).toBeLessThanOrEqual(1);
	}
});

test("recap keeps global server counts/full CSV and gates manual/audit controls; invitation toggle is accessible", () => {
	const recap = readFileSync(
		new URL("event-recap.tsx", import.meta.url),
		"utf8",
	);
	for (const count of ["invited", "present", "pending", "absent"])
		expect(recap).toContain(`counts.${count}`);
	expect(recap).toContain("selected && canManual");
	expect(recap).toContain("audit && canManual");
	expect(recap).toContain("visible.rows.map");
	const exportAction = jsxCallback(
		"event-recap.tsx",
		"onClick",
		"trpc.attendance.exportCsv",
	);
	expect(exportAction).toContain("queryOptions({ eventId })");
	expect(exportAction).not.toMatch(/visible|search|page/);
	const source = ts.createSourceFile(
		"event-recap.tsx",
		recap,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	let auditButton = false;
	function visit(node: ts.Node) {
		if (
			ts.isJsxElement(node) &&
			node.openingElement.tagName.getText(source) === "Button" &&
			node.children.some(
				(child) => ts.isJsxText(child) && child.text.trim() === "Audit",
			)
		) {
			auditButton = true;
			expect(
				node.openingElement.attributes.properties.some(
					(attribute) =>
						ts.isJsxAttribute(attribute) &&
						attribute.name.getText(source) === "variant" &&
						attribute.initializer?.getText(source) === '"outline"',
				),
			).toBe(true);
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	expect(auditButton).toBe(true);
	const detail = readFileSync(
		new URL("event-detail.tsx", import.meta.url),
		"utf8",
	);
	expect(detail).toContain("aria-expanded={invitationsOpen}");
	expect(detail).toContain("hidden={!invitationsOpen}");
	expect(detail).toContain('event.status === "DRAFT"');
	expect(detail).toContain("visibleInvitations.rows.map");
});

test("manual success closes the dialog and refreshes data; refresh failure remains saved feedback", async () => {
	for (const refreshFails of [false, true]) {
		const observed = {
			selected: true,
			message: "",
			successes: 0,
			warnings: 0,
			refreshes: 0,
		};
		const done = compile<() => Promise<void>>(
			jsxCallback("event-recap.tsx", "onDone"),
			{
				setSelected: () => {
					observed.selected = false;
				},
				setMessage: (value: string) => {
					observed.message = value;
				},
				toast: {
					success: () => {
						observed.successes++;
					},
					warning: () => {
						observed.warnings++;
					},
				},
				queryClient: {},
				attendanceQueryKeys: {},
				refreshAttendanceQueries: async () => {
					observed.refreshes++;
					if (refreshFails) throw new Error("Synthetic refresh failure");
				},
			},
		);
		await done();
		expect(observed.selected).toBe(false);
		expect(observed.refreshes).toBe(1);
		expect(observed.successes).toBe(1);
		expect(observed.warnings).toBe(refreshFails ? 1 : 0);
		expect(observed.message).toContain(
			refreshFails ? "sudah disimpan" : "berhasil disimpan",
		);
	}
});

test("event submit labels reflect create, draft edit, advanced edit and pending contexts", () => {
	const source = ts.createSourceFile(
		"form.tsx",
		readFileSync(new URL("event-form.tsx", import.meta.url), "utf8"),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	let label: ts.ConditionalExpression | undefined;
	const visit = (node: ts.Node) => {
		if (
			ts.isConditionalExpression(node) &&
			node.condition.getText(source) === "saving" &&
			node.getText(source).includes("Simpan perubahan draft")
		)
			label = node;
		ts.forEachChild(node, visit);
	};
	visit(source);
	expect(label).toBeDefined();
	for (const [saving, advancedMode, eventId, expected] of [
		[false, null, null, "Simpan draft"],
		[false, null, "event", "Simpan perubahan draft"],
		[false, "FULL", "event", "Simpan perubahan"],
		[false, "METADATA", "event", "Simpan perubahan"],
		[true, "LIMITED", "event", "Menyimpan perubahan…"],
	] as const) {
		expect(
			compile<() => string>(`() => (${label?.getText(source)})`, {
				saving,
				advancedMode,
				eventId,
			})(),
		).toBe(expected);
	}
});

test("administrative audit UI is backend-gated, expandable, paginated and renders meaningful fields without JSON", () => {
	const detail = readFileSync(
		new URL("event-detail.tsx", import.meta.url),
		"utf8",
	);
	const list = readFileSync(new URL("event-list.tsx", import.meta.url), "utf8");
	const history = readFileSync(
		new URL("event-admin-history.tsx", import.meta.url),
		"utf8",
	);
	expect(detail).toContain(
		"{administration && <EventAuditHistory eventId={eventId} />}",
	);
	expect(list).toContain(
		"management && query.data?.isSuperadmin && <DeletedDraftHistory />",
	);
	expect(list).toContain("!query.error &&");
	expect(list).toContain("!query.isPlaceholderData");
	expect(history).toContain("aria-expanded={open}");
	expect(history).toContain("enabled: open");
	expect(history).toContain("item.operator");
	expect(history).toContain("item.reason");
	expect(history).toContain("item.changes.map");
	expect(history).toContain("item.participants.addedCount");
	expect(history).toContain("setOffset(Math.max(0, offset - 20))");
	expect(history).not.toContain("JSON.stringify");
});

// Execute existing server functions with synthetic request/RPC/JSX boundaries.
// These are offline tests, not a real Next.js RSC/browser integration run.
function serverComponent(file: string, scope: Record<string, unknown>) {
	const source = ts.createSourceFile(
		file,
		readFileSync(new URL(file, import.meta.url), "utf8"),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const fn = source.statements.find(ts.isFunctionDeclaration);
	if (!fn) throw new Error("Server component missing");
	return compile<(props?: unknown) => Promise<unknown>>(
		fn.getText(source).replace(/^export default\s+/, ""),
		scope,
	);
}
const jsxScope = {
	React: {
		createElement: (tag: unknown, props: unknown, ...children: unknown[]) => ({
			tag,
			props,
			children,
		}),
	},
	DashboardHeader: "DashboardHeader",
	Card: "Card",
	CardContent: "CardContent",
	AppShell: "AppShell",
	LoginForm: "LoginForm",
};
function redirected(path: string): never {
	throw new Error(`REDIRECT:${path}`);
}

test("SSR dashboard and authenticated layout enforce invalid-session and mandatory-password redirects", async () => {
	for (const file of [
		"../identity/sr-dashboard.tsx",
		"../../app/(authenticated)/layout.tsx",
	]) {
		for (const session of [null, { requiresPasswordChange: true }]) {
			const component = serverComponent(file, {
				...jsxScope,
				getSrSession: async () => session,
				redirect: redirected,
			});
			await expect(component({ children: null })).rejects.toThrow(
				session
					? "REDIRECT:/change-password"
					: "REDIRECT:/login?reason=session",
			);
		}
	}
});

test("SSR login routes existing sessions and renders an expired-session message without a redirect loop", async () => {
	for (const session of [
		null,
		{ requiresPasswordChange: false },
		{ requiresPasswordChange: true },
	]) {
		const page = serverComponent("../../app/login/page.tsx", {
			...jsxScope,
			getSrSession: async () => session,
			redirect: redirected,
		});
		const result = page({
			searchParams: Promise.resolve({ reason: "session" }),
		});
		if (session)
			await expect(result).rejects.toThrow(
				session.requiresPasswordChange
					? "REDIRECT:/change-password"
					: "REDIRECT:/dashboard",
			);
		else
			expect(await result).toMatchObject({
				tag: "LoginForm",
				props: { expired: true },
			});
	}
});

test("dashboard renders SR and system identity from verified SSR data without client requests or polling", async () => {
	for (const session of [
		{
			actor: "SR",
			name: "Synthetic SR",
			nim: "00000123",
			requiresPasswordChange: false,
			mustChangePassword: true,
		},
		{
			actor: "SYSTEM_ADMIN",
			name: "Synthetic administrator",
			username: "synthetic.admin",
			requiresPasswordChange: false,
		},
	]) {
		const component = serverComponent("../identity/sr-dashboard.tsx", {
			...jsxScope,
			getSrSession: async () => session,
			redirect: redirected,
		});
		const rendered = JSON.stringify(await component());
		expect(rendered).toContain(session.name);
		expect(rendered).toContain(
			session.actor === "SR" ? "NIM: 00000123" : "Username: synthetic.admin",
		);
		expect(rendered).toContain(
			`"isSystem":${session.actor === "SYSTEM_ADMIN"}`,
		);
	}
	const dashboard = readFileSync(
		new URL("../identity/sr-dashboard.tsx", import.meta.url),
		"utf8",
	);
	for (const token of [
		'"use client"',
		"privateData",
		"useQuery",
		"refetchInterval",
	])
		expect(dashboard).not.toContain(token);
});

test("SSR session reads remain backend-authoritative, no-store and fail closed on revocation/storage failure", async () => {
	const text = readFileSync(
		new URL("../identity/server-session.ts", import.meta.url),
		"utf8",
	);
	const source = ts.createSourceFile(
		"session.ts",
		text,
		ts.ScriptTarget.Latest,
		true,
	);
	let expression: ts.Expression | undefined;
	const visit = (node: ts.Node) => {
		if (
			ts.isVariableDeclaration(node) &&
			node.name.getText(source) === "getSrSession"
		)
			expression = node.initializer;
		ts.forEachChild(node, visit);
	};
	visit(source);
	if (!expression) throw new Error("SSR session function missing");
	expect(expression.getText(source)).toStartWith("cache(");
	expect(text).toContain('import { cache } from "react"');
	let reads = 0;
	let current: { actor: string; requiresPasswordChange: boolean } | null = {
		actor: "SR",
		requiresPasswordChange: false,
	};
	let failing = false;
	let forwarded: unknown;
	const read = compile<() => Promise<unknown>>(expression.getText(source), {
		cache,
		headers: async () => new Headers({ cookie: "synthetic-session-cookie" }),
		getServerUrl: () => "http://synthetic.invalid",
		httpBatchLink: (options: unknown) => {
			forwarded = options;
			return options;
		},
		createTRPCClient: () => ({
			identity: {
				session: {
					query: async () => {
						reads++;
						if (failing) throw new Error("Synthetic storage unavailable");
						return current;
					},
				},
			},
		}),
	});
	expect(await read()).toEqual(current);
	expect(reads).toBe(1);
	expect((forwarded as { headers: { cookie: string } }).headers.cookie).toBe(
		"synthetic-session-cookie",
	);
	// React.cache is intentionally not persistent outside a server render pass.
	current = null;
	expect(await read()).toBeNull();
	expect(reads).toBe(2);
	failing = true;
	expect(await read()).toBeNull();
	expect(reads).toBe(3);
	expect(text).toContain('cache: "no-store"');
	expect(text).not.toMatch(/unstable_cache|use cache|@resora\/db/);
});

test("location preset restores Dorm Hall and custom selection preserves the existing point", () => {
	const dormHall = { centerLat: -6.9712891, centerLng: 107.628339 };
	for (const value of [false, true]) {
		let custom: boolean | undefined;
		let point = { centerLat: -6.9, centerLng: 107.6 };
		const handler = compile<() => void>(
			jsxCallback("./event-location-picker.tsx", "onChange", "setCustom"),
			{
				value,
				DORM_HALL: dormHall,
				setCustom: (next: boolean) => {
					custom = next;
				},
				onChange: (next: typeof point) => {
					point = next;
				},
			},
		);
		handler();
		expect(custom).toBe(value);
		expect(point).toEqual(
			value ? { centerLat: -6.9, centerLng: 107.6 } : dormHall,
		);
	}
});

test("keyboard map selection uses wrapped center coordinates", () => {
	let selected: unknown;
	const handler = compile<() => void>(
		jsxCallback("./event-location-map.tsx", "onClick", "getCenter"),
		{
			map: { getCenter: () => ({ wrap: () => ({ lat: -6.97, lng: 107.62 }) }) },
			onChange: (point: unknown) => {
				selected = point;
			},
		},
	);
	handler();
	expect(selected).toEqual({ centerLat: -6.97, centerLng: 107.62 });
});

test("map zoom controls invoke Leaflet zoom in and out and tolerate a loading map", () => {
	let zoom = 18;
	const map = {
		zoomIn: () => {
			zoom += 1;
		},
		zoomOut: () => {
			zoom -= 1;
		},
	};
	const zoomIn = compile<() => void>(
		jsxCallback("./event-location-map.tsx", "onClick", "zoomIn"),
		{ map },
	);
	const zoomOut = compile<() => void>(
		jsxCallback("./event-location-map.tsx", "onClick", "zoomOut"),
		{ map },
	);
	zoomOut();
	expect(zoom).toBe(17);
	zoomIn();
	expect(zoom).toBe(18);
	for (const action of ["zoomIn", "zoomOut"]) {
		const withoutMap = compile<() => void>(
			jsxCallback("./event-location-map.tsx", "onClick", action),
			{ map: null },
		);
		expect(withoutMap).not.toThrow();
	}
});
