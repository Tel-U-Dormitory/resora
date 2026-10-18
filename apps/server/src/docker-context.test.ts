import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
test("Docker context excludes credentials, account CSV and env values without unignore overrides", () => {
	const rules = readFileSync(new URL(".dockerignore", root), "utf8")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"));
	for (const pattern of [
		".private",
		"**/.private",
		"**/*.csv",
		"**/.env",
		"**/.env.*",
		"tmp",
		"temp",
		"**/.pgpass",
		"**/pgpass.conf",
	])
		expect(rules).toContain(pattern);
	expect(rules.filter((line) => line.startsWith("!"))).toEqual([
		"!**/.env.schema",
	]);
});

test("standalone copy removes nested env values; runtime entrypoints and secret mounts stay intact", () => {
	const web = readFileSync(new URL("apps/web/Dockerfile", root), "utf8");
	const server = readFileSync(new URL("apps/server/Dockerfile", root), "utf8");
	expect(web).toContain(
		"find .next/standalone -type f -name '.env*' ! -name '.env.schema' ! -name '.env.example' -delete",
	);
	expect(web).toContain(
		'CMD ["node", "--import", "varlock/auto-load", "server.js"]',
	);
	expect(server).toContain('CMD ["bun", "dist/index.mjs"]');
	for (const file of [web, server]) {
		expect(file).toContain("--mount=type=secret,id=web_env");
		expect(file).toContain("--mount=type=secret,id=server_env");
	}
});

test("production isolates ingress, database and runtime credentials", () => {
	const config = Bun.YAML.parse(
		readFileSync(new URL("docker-compose.prod.yml", root), "utf8"),
	) as {
		services: Record<
			"web" | "server",
			{
				ports?: unknown;
				container_name?: string;
				image: string;
				pull_policy: string;
				networks: Record<string, unknown> | string[];
				build: { args?: Record<string, string> };
				environment: Record<string, string>;
				env_file: string[];
			}
		>;
		networks: Record<string, { external?: boolean; name?: string }>;
		secrets: Record<string, { file: string }>;
	};
	expect(Object.keys(config.services).sort()).toEqual(["server", "web"]);
	for (const [name, service] of Object.entries(config.services)) {
		expect(service.image).toBe(
			`ghcr.io/tel-u-dormitory/resora-${name}:\${RESORA_IMAGE_TAG:?Set RESORA_IMAGE_TAG to the published full commit SHA}`,
		);
		expect(service.pull_policy).toBe("always");
		expect(service.ports).toBeUndefined();
		expect(service.container_name).toBeUndefined();
		expect(service.env_file[0]).toStartWith(".private/production/");
	}
	expect(Object.keys(config.services.web.networks).sort()).toEqual([
		"default",
		"proxy",
	]);
	expect(config.services.server.networks).toEqual(["default"]);
	expect(config.networks.proxy).toEqual({
		external: true,
		name: "resora-proxy",
	});
	expect(config.networks.default).toBeNull();
	expect(config.services.web.build.args).toEqual({
		NEXT_PUBLIC_SERVER_URL: "/",
		API_UPSTREAM_URL: "http://server:3000",
		SERVER_URL: "http://server:3000",
	});
	expect(config.services.web.environment.SERVER_URL).toBe("http://server:3000");
	expect(config.services.server.environment.CORS_ORIGIN).toBe(
		"https://telkomdormitory.com",
	);
	expect(config.services.server.environment.BETTER_AUTH_URL).toBe(
		"https://telkomdormitory.com",
	);
	expect(config.services.server.environment.DATABASE_BACKUP_ENABLED).toBe(
		"false",
	);
	for (const secret of Object.values(config.secrets))
		expect(secret.file).toEndWith("/.env.example");
	for (const file of ["apps/web/Dockerfile", "apps/server/Dockerfile"])
		expect(readFileSync(new URL(file, root), "utf8")).toContain("USER node");
});

test("GHCR publication is manual, uses paired SHA tags and synthetic secret files only", () => {
	const workflow = Bun.YAML.parse(
		readFileSync(new URL(".github/workflows/docker-publish.yml", root), "utf8"),
	) as {
		on: Record<string, unknown>;
		permissions: Record<string, string>;
		jobs: {
			publish: {
				steps: {
					uses?: string;
					run?: string;
					with?: Record<string, string | boolean>;
				}[];
			};
		};
	};
	expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
	expect(workflow.permissions).toEqual({ contents: "read", packages: "write" });
	const steps = workflow.jobs.publish.steps;
	expect(steps.some((step) => step.run !== undefined)).toBe(false);
	const builds = steps.filter((step) =>
		step.uses?.startsWith("docker/build-push-action@"),
	);
	expect(builds).toHaveLength(2);
	// biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression.
	const shaExpression = "${{ github.sha }}";
	expect(builds.map((step) => step.with?.tags).sort()).toEqual([
		`ghcr.io/tel-u-dormitory/resora-server:${shaExpression}`,
		`ghcr.io/tel-u-dormitory/resora-web:${shaExpression}`,
	]);
	for (const build of builds) {
		expect(build.with?.platforms).toBe("linux/amd64");
		expect(build.with?.push).toBe(true);
		expect(build.with?.["secret-files"]).toBe(
			"web_env=apps/web/.env.example\nserver_env=apps/server/.env.example\n",
		);
		expect(String(build.with?.labels)).toContain(
			"org.opencontainers.image.source=https://github.com/Tel-U-Dormitory/resora",
		);
	}
});
