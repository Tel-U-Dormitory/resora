import { expect, test } from "bun:test";
import {
	systemAdminInputSchema,
	validateBootstrapTarget,
} from "./system-admin-bootstrap";

test("bootstrap requires explicit guarded targets; it cannot infer Production or accept transaction poolers", () => {
	for (const value of [
		"",
		"postgresql://localhost/resora",
		"postgresql://remote.invalid/resora_identity_test_sa03_x",
		"postgresql://localhost/resora_identity_test_sa03_x?host=remote.invalid",
	])
		expect(() =>
			validateBootstrapTarget({
				mode: "local",
				url: value,
				database: "resora_identity_test_sa03_x",
			}),
		).toThrow();
	const reference = "abcdefghijklmnopqrst";
	for (const value of [
		`postgresql://postgres.${reference}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
		"postgresql://postgres@db.wrongprojectrefxxxxx.supabase.co:5432/postgres",
		`postgresql://postgres@db.${reference}.supabase.co:5432/postgres?sslmode=disable`,
	])
		expect(() =>
			validateBootstrapTarget({
				mode: "production",
				url: value,
				database: "postgres",
				reference,
			}),
		).toThrow();
	const target = validateBootstrapTarget({
		mode: "local",
		url: "postgresql://synthetic@127.0.0.1:55433/resora_identity_test_sa03_x",
		database: "resora_identity_test_sa03_x",
	});
	expect(target.hostname).toBe("127.0.0.1");
});

test("bootstrap administrative username is distinct from numeric NIM and inputs cannot assign SR attributes", () => {
	const base = {
		username: "resora.admin",
		name: "Synthetic system admin",
		email: "admin@example.invalid",
	};
	expect(systemAdminInputSchema.safeParse(base).success).toBe(true);
	for (const invalid of [
		{ username: "0000000001" },
		{ username: " " },
		{ email: "invalid" },
		{ departmentCode: "HCO" },
		{ userId: "existing-sr" },
	])
		expect(
			systemAdminInputSchema.safeParse({ ...base, ...invalid }).success,
		).toBe(false);
});
