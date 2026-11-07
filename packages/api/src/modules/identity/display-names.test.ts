import { expect, test } from "bun:test";
import type { Database } from "@resora/db";
import { getUserDisplayNames } from "./identity.public";

test("display-name contract batches historical identities without active-account filtering", async () => {
	let queries = 0;
	const db = {
		select: () => {
			queries++;
			return {
				from: () => ({
					where: async () => [
						{ userId: "archived", name: "Historical author" },
						{ userId: "active", name: "Current author" },
					],
				}),
			};
		},
	} as unknown as Database;
	expect(await getUserDisplayNames(db, [])).toEqual(new Map());
	expect(queries).toBe(0);
	const names = await getUserDisplayNames(db, ["archived", "active", "active"]);
	expect(names.get("archived")).toBe("Historical author");
	expect(names.get("active")).toBe("Current author");
	expect(names.has("missing")).toBe(false);
	expect(queries).toBe(1);
});
