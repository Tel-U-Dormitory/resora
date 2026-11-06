import { expect, test } from "bun:test";
import type { DatabaseTransaction } from "@resora/db";
import { deleteUnusedDraft } from "./events.public";

function deletionTarget(
	status: string,
	visibility: string,
	hasReferences: boolean,
) {
	let writes = 0;
	const db = {
		select: (selection?: object) => {
			const q = {
				from: () => q,
				where: () => q,
				for: () => q,
				// biome-ignore lint/suspicious/noThenProperty: Drizzle queries are awaitable.
				then: (resolve: (rows: unknown[]) => unknown) =>
					Promise.resolve(
						selection && "hasReferences" in selection
							? [{ hasReferences }]
							: [{ status, visibility }],
					).then(resolve),
			};
			return q;
		},
		delete: () => {
			writes++;
			return { where: () => ({ returning: async () => [{ id: "draft" }] }) };
		},
	} as unknown as DatabaseTransaction;
	return { db, writes: () => writes };
}
test("public draft deletion rejects non-drafts, hidden drafts and event evidence before mutation", async () => {
	for (const [status, visibility, refs] of [
		["PUBLISHED", "VISIBLE", false],
		["CLOSED", "VISIBLE", false],
		["DRAFT", "HIDDEN", false],
		["DRAFT", "VISIBLE", true],
	] as const) {
		const f = deletionTarget(status, visibility, refs);
		await expect(deleteUnusedDraft(f.db, "draft")).rejects.toMatchObject({
			code: "CONFLICT",
			message: "DRAFT_DELETE_NOT_ALLOWED",
		});
		expect(f.writes()).toBe(0);
	}
	const f = deletionTarget("DRAFT", "VISIBLE", false);
	expect(await deleteUnusedDraft(f.db, "draft")).toEqual([{ id: "draft" }]);
	expect(f.writes()).toBe(1);
});
