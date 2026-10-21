import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

for (const [file, ids] of [
	["login-form.tsx", ["password"]],
	[
		"password-change-form.tsx",
		["current-password", "new-password", "confirmation"],
	],
] as const) {
	test(`${file}: visibility defaults hidden, toggles independently and preserves credentials without submitting`, () => {
		const source = ts.createSourceFile(
			file,
			readFileSync(new URL(file, import.meta.url), "utf8"),
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX,
		);
		const elements: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
		const states = new Map<string, ts.VariableDeclaration>();
		function visit(node: ts.Node) {
			if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
				elements.push(node);
			if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name))
				states.set(node.name.elements[0]?.getText(source) ?? "", node);
			ts.forEachChild(node, visit);
		}
		visit(source);
		function attribute(node: (typeof elements)[number], name: string) {
			const attr = node.attributes.properties.find(
				(item) => ts.isJsxAttribute(item) && item.name.getText(source) === name,
			);
			if (!attr || !ts.isJsxAttribute(attr) || !attr.initializer)
				throw new Error(`Missing ${name}`);
			return ts.isJsxExpression(attr.initializer)
				? (attr.initializer.expression?.getText(source) ?? "undefined")
				: attr.initializer.getText(source);
		}
		const scope: Record<string, unknown> = {};
		function evaluate(expression: string): unknown {
			const js = ts.transpileModule(`const value = (${expression});`, {
				compilerOptions: { target: ts.ScriptTarget.ES2022 },
			}).outputText;
			return new Function(...Object.keys(scope), `${js}\nreturn value;`)(
				...Object.values(scope),
			);
		}
		const controls = ids.map((id) => {
			const input = elements.find(
				(node) =>
					node.tagName.getText(source) === "Input" &&
					attribute(node, "id") === JSON.stringify(id),
			);
			const button = elements.find(
				(node) =>
					node.tagName.getText(source) === "Button" &&
					node.attributes.properties.some(
						(item) =>
							ts.isJsxAttribute(item) &&
							item.name.getText(source) === "aria-controls" &&
							item.initializer?.getText(source) === JSON.stringify(id),
					),
			);
			if (!input || !button)
				throw new Error(`Missing visibility control: ${id}`);
			expect(attribute(button, "type")).toBe('"button"');
			expect(attribute(input, "className")).toContain("pr-12");
			const state = attribute(button, "aria-pressed");
			const declaration = states.get(state);
			expect(declaration?.initializer?.getText(source)).toBe("useState(false)");
			if (!declaration || !ts.isArrayBindingPattern(declaration.name))
				throw new Error("Missing independent visibility state");
			const setter = declaration.name.elements[1]?.getText(source);
			if (!setter) throw new Error("Missing visibility setter");
			scope[state] = false;
			scope[setter] = (update: (visible: boolean) => boolean) => {
				scope[state] = update(scope[state] as boolean);
			};
			scope[attribute(input, "value")] = `synthetic-${id}`;
			return { input, button };
		});
		for (const selected of controls) {
			for (const expected of [true, false]) {
				const click = evaluate(
					attribute(selected.button, "onClick"),
				) as () => void;
				click();
				for (const control of controls) {
					const visible = selected === control && expected;
					expect(evaluate(attribute(control.input, "type"))).toBe(
						visible ? "text" : "password",
					);
					expect(evaluate(attribute(control.button, "aria-pressed"))).toBe(
						visible,
					);
					expect(evaluate(attribute(control.button, "aria-label"))).toMatch(
						visible ? /^Sembunyikan / : /^Tampilkan /,
					);
					expect(evaluate(attribute(control.input, "value"))).toBe(
						`synthetic-${JSON.parse(attribute(control.input, "id"))}`,
					);
				}
			}
		}
	});
}

// Check the actual JSX without hydration, auth mocks, or a browser harness.
for (const [file, authMethod] of [
	["login-form.tsx", "authClient.signIn.username"],
	["password-change-form.tsx", "authClient.changePassword"],
	["account-create-form.tsx", "trpcClient.identity.createAccount.mutate"],
] as const) {
	test(`${file}: native credential submission stays POST and the existing client handles JS submission`, () => {
		const source = ts.createSourceFile(
			file,
			readFileSync(new URL(file, import.meta.url), "utf8"),
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX,
		);
		let forms = 0;
		let authCalls = 0;
		let preventsDefault = 0;
		function visit(node: ts.Node) {
			if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
				const attributes = node.attributes.properties;
				// No spread or submit-control override may silently restore GET.
				for (const attribute of attributes) {
					if (
						["form", "input", "Input", "button", "Button"].includes(
							node.tagName.getText(source),
						)
					) {
						expect(ts.isJsxSpreadAttribute(attribute)).toBe(false);
					}
					if (ts.isJsxAttribute(attribute)) {
						expect(attribute.name.getText(source)).not.toBe("formMethod");
						expect(attribute.name.getText(source)).not.toBe("formAction");
					}
				}
				if (node.tagName.getText(source) === "form") {
					forms++;
					const method = attributes.find(
						(attribute) =>
							ts.isJsxAttribute(attribute) &&
							attribute.name.getText(source) === "method",
					);
					expect(
						method &&
							ts.isJsxAttribute(method) &&
							method.initializer?.getText(source),
					).toBe('"post"');
				}
			}
			if (ts.isCallExpression(node)) {
				const expression = node.expression.getText(source);
				if (expression === authMethod) authCalls++;
				if (expression === "event.preventDefault") preventsDefault++;
			}
			ts.forEachChild(node, visit);
		}
		visit(source);
		expect(forms).toBe(1);
		expect(authCalls).toBe(1);
		expect(preventsDefault).toBe(1);
	});
}

test("password change keeps the mandatory redirect and gives voluntary changes local success feedback", () => {
	const text = readFileSync(
		new URL("password-change-form.tsx", import.meta.url),
		"utf8",
	);
	const source = ts.createSourceFile(
		"password-change-form.tsx",
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	let mandatoryDefault = false;
	let redirectBranches = 0;
	let revokesOtherSessions = false;
	function visit(node: ts.Node) {
		if (ts.isBindingElement(node) && node.name.getText(source) === "mandatory")
			mandatoryDefault = node.initializer?.getText(source) === "true";
		if (
			ts.isIfStatement(node) &&
			node.expression.getText(source) === "mandatory" &&
			node.thenStatement
				.getText(source)
				.includes('router.replace("/dashboard")')
		) {
			redirectBranches++;
			expect(node.elseStatement?.getText(source)).toContain("setSuccess(true)");
		}
		if (
			ts.isPropertyAssignment(node) &&
			node.name.getText(source) === "revokeOtherSessions"
		)
			revokesOtherSessions =
				node.initializer.kind === ts.SyntaxKind.TrueKeyword;
		ts.forEachChild(node, visit);
	}
	visit(source);
	expect(mandatoryDefault).toBe(true);
	expect(redirectBranches).toBe(1);
	expect(revokesOtherSessions).toBe(true);
});

test("SSR login and protected layouts redirect using the derived password requirement, not the stored flag", () => {
	for (const path of [
		"sr-dashboard.tsx",
		"../../app/login/page.tsx",
		"../../app/(authenticated)/layout.tsx",
		"../../app/(authenticated)/admin/users/layout.tsx",
	]) {
		const source = readFileSync(new URL(path, import.meta.url), "utf8");
		expect(source).toContain(".requiresPasswordChange");
		expect(source).not.toContain(".mustChangePassword");
	}
	const mandatoryPage = readFileSync(
		new URL("../../app/change-password/page.tsx", import.meta.url),
		"utf8",
	);
	expect(mandatoryPage).toContain(
		'if (!session.requiresPasswordChange) redirect("/profile")',
	);
});

test("admin credential delivery avoids persistent/mutation/query storage and clears the success state", () => {
	const text = readFileSync(
		new URL("account-create-form.tsx", import.meta.url),
		"utf8",
	);
	const source = ts.createSourceFile(
		"account-create-form.tsx",
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const calls: string[] = [];
	function visit(node: ts.Node) {
		if (ts.isCallExpression(node)) calls.push(node.expression.getText(source));
		ts.forEachChild(node, visit);
	}
	visit(source);
	for (const call of calls) {
		expect(
			/(?:localStorage|sessionStorage|console\.|setQueryData|setQueriesData|useMutation)/.test(
				call,
			),
		).toBe(false);
	}
	expect(text).toContain("setCredentials(null)");
	expect(text).toContain("submitting.current");
	expect(text).toContain("Periksa daftar akun sebelum mencoba kembali");
});
