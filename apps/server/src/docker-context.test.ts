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

test("permanent CI/CD scopes PR validation and staging-only publication safely", () => {
	type Step = {
		uses?: string;
		run?: string;
		"continue-on-error"?: boolean;
		with?: Record<string, string | boolean>;
	};
	type Workflow = {
		name: string;
		on: Record<string, { branches: string[] }>;
		permissions: Record<string, string>;
		concurrency?: { group: string; "cancel-in-progress": boolean };
		jobs: Record<
			string,
			{
				name?: string;
				"runs-on": string;
				permissions?: Record<string, string>;
				steps: Step[];
			}
		>;
	};
	const readWorkflow = (file: string) =>
		Bun.YAML.parse(
			readFileSync(new URL(`.github/workflows/${file}.yml`, root), "utf8"),
		) as Workflow;
	const quality = readWorkflow("ci");
	const verify = readWorkflow("docker-verify");
	const publish = readWorkflow("docker-publish");
	expect(quality.name).toBe("CI — Code Quality");
	expect(verify.name).toBe("CI — Docker Build");
	expect(publish.name).toBe("CD — Publish Images");
	expect(quality.on).toEqual({
		pull_request: { branches: ["dev", "staging", "main"] },
	});
	expect(verify.on).toEqual({ pull_request: { branches: ["staging"] } });
	expect(publish.on).toEqual({ push: { branches: ["staging"] } });
	expect(publish.concurrency).toEqual({
		group: "ghcr-publish-staging",
		"cancel-in-progress": false,
	});
	for (const workflow of [quality, verify, publish]) {
		const secretReferences = [
			...JSON.stringify(workflow).matchAll(/secrets\.([A-Z_]+)/g),
		].map((match) => match[1]);
		expect(secretReferences).toEqual(
			workflow === publish ? ["GITHUB_TOKEN"] : [],
		);
		expect(workflow.permissions).toEqual(
			workflow === publish
				? { contents: "read", packages: "write" }
				: { contents: "read" },
		);
		for (const job of Object.values(workflow.jobs)) {
			expect(job["runs-on"]).toBe("ubuntu-latest");
			expect(job.permissions).toBeUndefined();
		}
	}
	const qualityJob = Object.values(quality.jobs)[0];
	expect(qualityJob?.name).toBe("CI — Code Quality");
	expect(
		qualityJob?.steps.filter((step) => step.run).map((step) => step.run),
	).toEqual([
		"pnpm install --frozen-lockfile",
		"pnpm --filter web exec next typegen",
		"pnpm exec biome check .",
		"pnpm run check-types",
		"pnpm run test:offline",
		"pnpm run build",
	]);
	// biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression.
	const shaExpression = "${{ github.sha }}";
	for (const workflow of [verify, publish]) {
		const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
		expect(steps.some((step) => step.run !== undefined)).toBe(false);
		expect(
			steps.filter((step) => step.uses?.startsWith("docker/login-action@")),
		).toHaveLength(workflow === publish ? 1 : 0);
		const checkout = steps.find((step) =>
			step.uses?.startsWith("actions/checkout@"),
		);
		expect(checkout?.with?.ref).toBeUndefined(); // PR default is the integration merge ref.
		expect(checkout?.with?.["persist-credentials"]).toBe(false);
		const builds = steps.filter((step) =>
			step.uses?.startsWith("docker/build-push-action@"),
		);
		expect(builds).toHaveLength(2);
		expect(builds.map((step) => step.with?.file).sort()).toEqual([
			"apps/server/Dockerfile",
			"apps/web/Dockerfile",
		]);
		for (const build of builds) {
			expect(build["continue-on-error"]).not.toBe(true);
			expect(build.with?.platforms).toBe("linux/amd64");
			expect(build.with?.push).toBe(workflow === publish);
			expect(build.with?.["secret-files"]).toBe(
				"web_env=apps/web/.env.example\nserver_env=apps/server/.env.example\n",
			);
			if (workflow === publish) {
				const image =
					build.with?.file === "apps/web/Dockerfile" ? "web" : "server";
				expect(build.with?.tags).toBe(
					`ghcr.io/tel-u-dormitory/resora-${image}:${shaExpression}`,
				);
				expect(String(build.with?.labels)).toContain(
					"org.opencontainers.image.source=https://github.com/Tel-U-Dormitory/resora",
				);
				expect(String(build.with?.labels)).toContain(
					`org.opencontainers.image.revision=${shaExpression}`,
				);
			} else {
				expect(build.with?.tags).toBeUndefined();
				expect(build.with?.["cache-to"]).toBeUndefined(); // PRs cannot export publication caches.
			}
		}
		const web = builds.find(
			(step) => step.with?.file === "apps/web/Dockerfile",
		);
		expect(web?.with?.["build-args"]).toBe(
			"NEXT_PUBLIC_SERVER_URL=/\nAPI_UPSTREAM_URL=http://server:3000\nSERVER_URL=http://server:3000\n",
		);
	}
});
