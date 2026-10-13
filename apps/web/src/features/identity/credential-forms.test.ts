import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

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
