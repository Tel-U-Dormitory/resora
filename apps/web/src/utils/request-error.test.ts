import { expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { queryErrorMessage } from "./request-error";

test("query toasts never reflect raw validation/internal/network secrets", () => {
	for (const error of [
		new Error("synthetic-private-password-token"),
		new TRPCClientError('[{"secret":"synthetic-private-password-token"}]'),
		"raw-secret",
	]) {
		expect(queryErrorMessage(error)).toBe(
			"Permintaan belum dapat diproses. Silakan coba kembali.",
		);
	}
	expect(
		queryErrorMessage(new TRPCClientError("PASSWORD_CHANGE_REQUIRED")),
	).toContain("Ganti password");
});
