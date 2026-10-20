import { expect, test } from "bun:test";
import { parseResetLinkArgs } from "./reset-password-link";

const env = {
	RESORA_PASSWORD_RESET_DB_URL:
		"postgresql://synthetic:synthetic@127.0.0.1:55433/resora_identity_test_recovery",
	RESORA_PASSWORD_RESET_APP_ORIGIN: "http://localhost:3001",
};
const args = [
	"--target",
	"local",
	"--database",
	"resora_identity_test_recovery",
	"--email",
	"synthetic@example.invalid",
];
test("manual CLI defaults to non-issuing preflight; no fallback or token arguments", () => {
	expect(parseResetLinkArgs(args, env, true).apply).toBe(false);
	expect(() =>
		parseResetLinkArgs(
			args,
			{
				DATABASE_URL: env.RESORA_PASSWORD_RESET_DB_URL,
				RESORA_PASSWORD_RESET_APP_ORIGIN: env.RESORA_PASSWORD_RESET_APP_ORIGIN,
			},
			true,
		),
	).toThrow();
	expect(() =>
		parseResetLinkArgs([...args, "--token", "synthetic"], env, true),
	).toThrow("INVALID_ARGUMENTS");
	expect(() =>
		parseResetLinkArgs([...args, "--nim", "0000000001"], env, true),
	).toThrow();
});
test("issuance requires explicit confirmation and a private interactive terminal", () => {
	expect(() =>
		parseResetLinkArgs(
			[...args, "--dry-run", "--apply", "--confirm-issue", "ISSUE"],
			env,
			true,
		),
	).toThrow("INVALID_ARGUMENTS");
	expect(() => parseResetLinkArgs([...args, "--apply"], env, true)).toThrow();
	expect(() =>
		parseResetLinkArgs(
			[...args, "--apply", "--confirm-issue", "ISSUE"],
			env,
			false,
		),
	).toThrow();
	expect(
		parseResetLinkArgs(
			[...args, "--apply", "--confirm-issue", "ISSUE"],
			env,
			true,
		).apply,
	).toBe(true);
});
test("Production targeting requires an exact pinned project, confirmation and verified TLS CA", () => {
	const ref = "abcdefghijklmnopqrst";
	const remote = {
		...env,
		RESORA_PASSWORD_RESET_APP_ORIGIN: "https://web.example.test",
		RESORA_PASSWORD_RESET_DB_URL: `postgresql://postgres:synthetic@db.${ref}.supabase.co:5432/postgres`,
	};
	const command = [
		"--target",
		"production",
		"--database",
		"postgres",
		"--project-reference",
		ref,
		"--email",
		"synthetic@example.invalid",
	];
	expect(() => parseResetLinkArgs(command, remote, true)).toThrow(
		"EXPLICIT_PRODUCTION_CONFIRMATION_REQUIRED",
	);
	expect(() =>
		parseResetLinkArgs([...command, "--confirm-production", ref], remote, true),
	).toThrow("VERIFIED_PRODUCTION_TLS_CA_REQUIRED");
	expect(
		parseResetLinkArgs(
			[...command, "--confirm-production", ref],
			{
				...remote,
				RESORA_PASSWORD_RESET_SSL_CA: "synthetic-not-used-for-connections",
			},
			true,
		).apply,
	).toBe(false);
	expect(() => parseResetLinkArgs(args, remote, true)).toThrow();
});
