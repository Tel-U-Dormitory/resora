import { expect, test } from "bun:test";
import { selectToc, validateConfig } from "./standby";

const config = {
	source: {
		url: "postgresql://operator:synthetic@127.0.0.1:55438/resora_identity_test_source",
	},
	standby: {
		url: "postgresql://operator:synthetic@127.0.0.1:55438/resora_standby_test_target",
		mode: "local-test",
		purpose: "dedicated-non-production-standby",
		appRole: "standby_app",
	},
	directory: "/tmp/synthetic-standby-test",
	keyFile: "/tmp/synthetic-key",
};

test("standby configuration has no application-env fallback and rejects ordinary/redirected local targets", () => {
	expect(validateConfig(config).standby.mode).toBe("local-test");
	for (const url of [
		"postgresql://operator:synthetic@127.0.0.1/resora",
		"postgresql://operator:synthetic@remote.invalid/resora_standby_test_target",
		`${config.standby.url}?host=remote.invalid`,
		config.source.url,
	])
		expect(() =>
			validateConfig({ ...config, standby: { ...config.standby, url } }),
		).toThrow();
	expect(() =>
		validateConfig({
			...config,
			standby: { ...config.standby, appRole: 'unsafe"; DROP SCHEMA public' },
		}),
	).toThrow();
});

test("Supabase requires a matching explicit reference, database, session/direct endpoint and CA", () => {
	const ref = "abcdefghijklmnopqrst";
	const standby = {
		...config.standby,
		mode: "supabase",
		projectRef: ref,
		url: `postgresql://operator:synthetic@db.${ref}.supabase.co:5432/postgres`,
		caFile: "/tmp/ca.crt",
	};
	expect(validateConfig({ ...config, standby }).standby.projectRef).toBe(ref);
	for (const change of [
		{ caFile: undefined },
		{ projectRef: "tsrqponmlkjihgfedcba" },
		{
			url: "postgresql://operator:synthetic@aws-0-region.pooler.supabase.com:6543/postgres",
		},
		{ url: `postgresql://operator:synthetic@db.${ref}.supabase.co/resora` },
	])
		expect(() =>
			validateConfig({ ...config, standby: { ...standby, ...change } }),
		).toThrow();
});

test("archive selection never drops schemas or restores managed objects", () => {
	const metadata = "1; 0 0 TABLE DATA drizzle __drizzle_migrations postgres";
	const toc = selectToc(
		`; header\n2; 0 0 SCHEMA - public postgres\n${metadata}\n3; 0 0 TABLE public user postgres\n`,
	);
	expect(toc).not.toContain("SCHEMA");
	expect(toc).toContain("TABLE public user");
	for (const entry of [
		"4; 0 0 TABLE auth users postgres",
		"4; 0 0 TABLE storage objects postgres",
		"4; 0 0 EXTENSION - pgcrypto postgres",
		"4; 0 0 DATABASE - postgres postgres",
		"4; 0 0 PUBLICATION - dangerous postgres",
	])
		expect(() => selectToc(`${metadata}\n${entry}`)).toThrow();
	expect(() => selectToc("1; 0 0 TABLE public user postgres")).toThrow();
});
