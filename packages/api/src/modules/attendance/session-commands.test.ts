import { expect, test } from "bun:test";
import type { DatabaseTransaction } from "@resora/db";
import { activateInternalSession } from "./attendance.public";

test("public activation locks and rejects an already active/closed session without writing", async () => {
	for (const status of ["ACTIVE", "CLOSED", "INACTIVE"]) {
		const calls: string[] = [];
		const db = {
			select: () => ({
				from: () => ({
					where: () => ({
						for: async (mode: string) => {
							calls.push(mode);
							return [{ status }];
						},
					}),
				}),
			}),
			update: () => {
				calls.push("write");
				return { set: () => ({ where: async () => {} }) };
			},
		} as unknown as DatabaseTransaction;
		if (status === "INACTIVE")
			await activateInternalSession(db, "session", new Date());
		else
			await expect(
				activateInternalSession(db, "session", new Date()),
			).rejects.toMatchObject({ code: "CONFLICT" });
		expect(calls).toEqual(
			status === "INACTIVE" ? ["update", "write"] : ["update"],
		);
	}
});
