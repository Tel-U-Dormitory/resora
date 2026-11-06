import { expect, test } from "bun:test";
import { violations } from "./src/architecture";

const modulePath = (name: string, file: string) => `packages/api/src/modules/${name}/${file}.ts`;
test("public contracts pass; private relative/alias imports, dynamic imports and cycles fail", () => {
	const a = modulePath("broadcast", "broadcast.service");
	const b = modulePath("identity", "identity.public");
	expect(violations(new Map([[a, 'import { x } from "../identity/identity.public";'], [b, "export const x = 1;"]]))).toEqual([]);
	for (const source of ['import "../identity/identity-policy";', 'import "@resora/api/modules/identity/identity-policy";', 'import("../identity/identity-policy");']) {
		expect(violations(new Map([[a, source], [modulePath("identity", "identity-policy"), ""]])).join()).toContain("private module import");
	}
	expect(violations(new Map([[a, 'import "../identity/identity.public";'], [b, 'import "../broadcast/broadcast.public";'], [modulePath("broadcast", "broadcast.public"), ""]])).join()).toContain("cycle:");
});
test("foreign tables, application SQL imports and transitive browser/server leaks fail", () => {
	const table = "packages/db/src/schema/identity.ts";
	expect(violations(new Map([[modulePath("broadcast", "broadcast.service"), 'import { userProfiles } from "@resora/db/schema/identity";'], [table, ""]])).join()).toContain("foreign table access");
	expect(violations(new Map([["packages/api/src/application/workflow.ts", 'import "@resora/db/schema/identity";'], [table, ""]])).join()).toContain("application persistence access");
	expect(violations(new Map([["apps/web/src/features/broadcast/view.tsx", '"use client"; import "./helper";'], ["apps/web/src/features/broadcast/helper.ts", 'import "node:crypto";']])).join()).toContain("server dependency in browser");
});
test("type-only references are safe and frontend feature boundaries reject private access", () => {
	expect(violations(new Map([["apps/web/src/features/broadcast/view.tsx", '"use client"; import type { X } from "node:crypto";']]))).toEqual([]);
	expect(violations(new Map([["apps/web/src/features/broadcast/view.tsx", 'import "../identity/login-form";'], ["apps/web/src/features/identity/login-form.tsx", ""]])).join()).toContain("private feature import");
});
