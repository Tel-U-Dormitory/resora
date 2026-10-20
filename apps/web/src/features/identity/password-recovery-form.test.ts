import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const text = readFileSync(
	new URL("password-recovery-form.tsx", import.meta.url),
	"utf8",
);
test("recovery UI keeps native submission POST, masked inputs, labels and visible feedback", () => {
	const source = ts.createSourceFile(
		"recovery.tsx",
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	let forms = 0;
	let passwords = 0;
	function visit(node: ts.Node) {
		if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
			const attribute = (key: string) =>
				node.attributes.properties
					.find(
						(prop) =>
							ts.isJsxAttribute(prop) && prop.name.getText(source) === key,
					)
					?.getText(source);
			if (node.tagName.getText(source) === "form") {
				forms++;
				expect(attribute("method")).toBe('method="post"');
				expect(attribute("onSubmit")).toContain("event.preventDefault()");
			}
			if (
				node.tagName.getText(source) === "Input" &&
				attribute("type") === 'type="password"'
			) {
				passwords++;
				expect(attribute("autoComplete")).toBe('autoComplete="new-password"');
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	expect(forms).toBe(1);
	expect(passwords).toBe(2);
	expect(text).toContain('role="alert"');
	expect(text).toContain('role="status"');
	expect(text).toContain("submitting.current");
	expect(text).toContain("loading={pending}");
});
test("recovery uses native clients; token stays in memory/body and is removed from browser URL", () => {
	expect(text).toContain("authClient.requestPasswordReset");
	expect(text).toContain("authClient.resetPassword");
	expect(text).toContain("window.location.hash");
	expect(text).toContain("window.history.replaceState");
	expect(text).toContain("password !== confirmation");
	expect(text).toContain("password.length > 128");
	for (const forbidden of [
		"localStorage",
		"sessionStorage",
		"console.",
		"location.search",
		"result.error.message",
	])
		expect(text).not.toContain(forbidden);
	expect(
		readFileSync(new URL("login-form.tsx", import.meta.url), "utf8"),
	).toContain('href="/forgot-password"');
});
