import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Check the actual JSX without hydration, auth mocks, or a browser harness.
for (const [file, authMethod] of [
	["login-form.tsx", "authClient.signIn.username"],
	["password-change-form.tsx", "authClient.changePassword"],
] as const) {
	test(`${file}: native credential submission stays POST and Better Auth handles JS submission`, () => {
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
