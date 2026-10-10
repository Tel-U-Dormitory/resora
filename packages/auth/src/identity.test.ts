import { afterAll, expect, test } from "bun:test";
import { createDb } from "@resora/db";

import { createAuth } from "./index";

const db = createDb({
	DATABASE_URL: "postgresql://localhost:1/synthetic_phase2a",
});
afterAll(() => db.$client.end());

test("Username Plugin exposes NIM login without normalizing away identifier text", () => {
	const auth = createAuth(
		{
			BETTER_AUTH_URL: "http://localhost:3000",
			BETTER_AUTH_SECRET:
				"synthetic-phase2a-test-secret-never-used-outside-tests",
			CORS_ORIGIN: "http://localhost:3001",
		},
		db,
	);
	const plugin = auth.options.plugins[0];
	expect(plugin?.id).toBe("username");
	expect(typeof auth.api.signInUsername).toBe("function");
	const usernameField = plugin?.schema.user.fields.username;
	expect(usernameField?.unique).toBe(true);
	expect(usernameField?.transform.input("0000123456")).toBe("0000123456");
});
