import { afterEach, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const script = join(repo, "scripts/deploy-prod.sh");
const oldSha = "a".repeat(40);
const newSha = "b".repeat(40);
const digest = (char: string) => `sha256:${char.repeat(64)}`;
const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

// Only these executables emulate Docker/HTTPS; no daemon, sockets or DB are used.
const mock = String.raw`#!${process.execPath} --no-env-file
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.MOCK_ROOT;
const args = process.argv.slice(2);
const tool = path.basename(process.argv[1]);
fs.appendFileSync(dir + '/calls', tool + ' ' + args.join(' ') + '\n');
const read = f => fs.readFileSync(f, 'utf8').trim();
const active = () => JSON.parse(read(dir + '/active'));
const fail = msg => { console.error(msg); process.exit(1); };
if (tool === 'df') { console.log('Filesystem 1024-blocks Used Available Capacity Mounted on\nmock 20000000 1 ' + (process.env.LOW_DISK ? '1000' : '10000000') + ' 1% /'); }
else if (tool === 'curl') {
  console.log((process.env.FAIL_SMOKE || (process.env.FAIL_API && args.at(-1).endsWith('healthCheck'))) && active().sha === '${newSha}' ? '500' : '200');
} else if (args[0] === 'pull') {
  if (process.env.FAIL_PULL && args[1].includes('server@')) fail('synthetic pull failure');
} else if (args[0] === 'image' && args[1] === 'inspect') {
  if (process.env.MISSING_OLD && args[2].endsWith('${"1".repeat(64)}')) fail('missing rollback image');
  if (args.includes('--format')) console.log(args[2].split('@')[1]);
} else if (args[0] === 'inspect') {
  const state = active();
  const service = args[1].includes('-web-') ? 'web' : 'server';
  const format = args.at(-1);
  if (format.includes('config_files')) console.log(dir + '/source/docker-compose.prod.yml');
  else if (format.includes('Health.Status')) console.log('healthy');
  else if (format.includes('.Config.Image')) console.log('ghcr.io/tel-u-dormitory/resora-' + service + ':' + state.sha);
  else if (format.includes('.Image')) console.log(process.env.DRIFT ? 'unexpected' : state[service]);
  else fail('unknown inspect format');
} else if (args[0] === 'compose') {
  const release = args[args.indexOf('--project-directory') + 1];
  if (args.includes('--no-path-resolution')) { console.log(fs.readFileSync(release + '/docker-compose.prod.yml', 'utf8')); }
  if (args.includes('up')) {
    const state = {sha: read(release + '/sha'), web: read(release + '/web.digest'), server: read(release + '/server.digest')};
    fs.writeFileSync(dir + '/active', JSON.stringify(state));
    if (process.env.FAIL_RECOVERY && state.sha === '${oldSha}') fail('synthetic rollback failure');
    if (state.sha === '${newSha}' && process.env.FAIL_UP) fail('synthetic partial rollout');
    if (state.sha === '${newSha}' && process.env.TERMINATE) { process.kill(process.ppid, 'SIGTERM'); process.exit(1); }
  } else if (!args.includes('config')) fail('unknown compose command');
} else if (args[0] !== 'ps') fail('unexpected Docker command');
`;

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "resora-cd-"));
	roots.push(root);
	for (const dir of [
		"bin",
		"source/apps/web",
		"source/apps/server",
		".private/production",
	])
		mkdirSync(join(root, dir), { recursive: true });
	for (const tool of ["docker", "curl", "df"]) {
		writeFileSync(join(root, "bin", tool), mock);
		chmodSync(join(root, "bin", tool), 0o700);
	}
	cpSync(
		join(repo, "docker-compose.prod.yml"),
		join(root, "source/docker-compose.prod.yml"),
	);
	for (const service of ["web", "server"]) {
		writeFileSync(
			join(root, `source/apps/${service}/.env.example`),
			"SYNTHETIC=1\n",
		);
		writeFileSync(
			join(root, `.private/production/${service}.env`),
			"SYNTHETIC=1\n",
		);
	}
	writeFileSync(
		join(root, "active"),
		JSON.stringify({ sha: oldSha, web: digest("1"), server: digest("2") }),
	);
	const env = {
		...process.env,
		MOCK_ROOT: root,
		PATH: `${root}/bin:${process.env.PATH}`,
	};
	const args = (mode: string, run = "1") => [
		script,
		mode,
		root,
		join(root, "source"),
		mode === "bootstrap" ? oldSha : newSha,
		digest(mode === "bootstrap" ? "1" : "3"),
		digest(mode === "bootstrap" ? "2" : "4"),
		mode === "bootstrap" ? "0" : run,
	];
	const execute = (
		mode: string,
		extra: Record<string, string> = {},
		run = "1",
	) =>
		spawnSync("bash", args(mode, run), {
			env: { ...env, ...extra },
			encoding: "utf8",
		});
	const bootstrap = execute("bootstrap");
	expect(bootstrap.status, bootstrap.stderr).toBe(0);
	const state = () =>
		readFileSync(join(root, "state"), "utf8").trim().split(" ");
	const calls = () => readFileSync(join(root, "calls"), "utf8");
	return { root, env, args, execute, state, calls };
}

test("bootstrap does not recreate containers; deploy pins both digests; manual rollback preserves watermark", () => {
	const f = fixture();
	const baseline = f.state()[0];
	expect(f.calls()).not.toContain(" up ");
	expect(f.execute("deploy").status).toBe(0);
	expect(f.state()[1]).toBe(baseline);
	expect(f.state()[2]).toBe("1");
	const calls = f.calls();
	expect(
		calls.indexOf(`pull ghcr.io/tel-u-dormitory/resora-server@${digest("4")}`),
	).toBeLessThan(calls.indexOf(" up "));
	expect(calls).toContain("--no-build --pull never --wait --wait-timeout 180");
	expect(f.execute("rollback").status).toBe(0);
	expect(f.state()[0]).toBe(baseline);
	expect(f.state()[2]).toBe("1");
	expect(f.execute("deploy").status).not.toBe(0);
});

test("missing baseline blocks first automated deployment", () => {
	const f = fixture();
	rmSync(join(f.root, "state"));
	expect(f.execute("deploy").stderr).toContain(
		"Bootstrap existing healthy production",
	);
	expect(f.calls()).not.toContain(" up ");
});

for (const fault of ["FAIL_PULL", "LOW_DISK", "DRIFT", "MISSING_OLD"]) {
	test(`${fault} leaves the current release and containers untouched`, () => {
		const f = fixture();
		const baseline = f.state();
		expect(f.execute("deploy", { [fault]: "1" }).status).not.toBe(0);
		expect(f.state()).toEqual(baseline);
		expect(f.calls()).not.toContain(" up ");
	});
}

for (const fault of ["FAIL_UP", "FAIL_SMOKE", "FAIL_API", "TERMINATE"]) {
	test(`${fault} restores the old pair and reports failure`, () => {
		const f = fixture();
		const baseline = f.state();
		const result = f.execute("deploy", { [fault]: "1" });
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("Recorded healthy release restored");
		expect(f.state()).toEqual(baseline);
		expect(JSON.parse(readFileSync(join(f.root, "active"), "utf8")).sha).toBe(
			oldSha,
		);
		expect(existsSync(join(f.root, "pending"))).toBe(false);
	});
}

test("pending transaction recovers before another deployment; per-release env snapshot remains unchanged", () => {
	const f = fixture();
	writeFileSync(join(f.root, "pending"), "interrupted\n");
	writeFileSync(
		join(f.root, ".private/production/server.env"),
		"SYNTHETIC=2\n",
	);
	const baseline = f.state()[0];
	expect(f.execute("deploy").status).toBe(0);
	expect(
		readFileSync(
			join(f.root, `.private/releases/${baseline}/production/server.env`),
			"utf8",
		),
	).toBe("SYNTHETIC=1\n");
	expect(f.calls()).toContain("--pull never");
});

test("concurrent invocation cannot enter rollout while another process holds the deployment lock", async () => {
	const f = fixture();
	const holder = spawn(
		"flock",
		["-x", join(f.root, ".deploy.lock"), "sh", "-c", "echo ready; cat"],
		{ stdio: ["pipe", "pipe", "pipe"] },
	);
	try {
		await new Promise<void>((resolve) =>
			holder.stdout.once("data", () => resolve()),
		);
		expect(f.execute("deploy").stderr).toContain(
			"Another deployment/rollback is active",
		);
		expect(f.calls()).not.toContain(" up ");
	} finally {
		holder.stdin.end();
		await new Promise<void>((resolve) => holder.once("exit", () => resolve()));
	}
});

test("SSH transport rejects shell injection before contacting a host", () => {
	const result = spawnSync("bash", [join(repo, "scripts/deploy-prod-ssh.sh")], {
		env: { ...process.env, VPS_HOST: "host; touch /tmp/unwanted" },
		encoding: "utf8",
	});
	expect(result.status).not.toBe(0);
});

test("rollback failure retains the recovery marker and blocks subsequent changes", () => {
	const f = fixture();
	const baseline = f.state();
	const result = f.execute("deploy", { FAIL_UP: "1", FAIL_RECOVERY: "1" });
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain("ROLLBACK FAILED");
	expect(f.state()).toEqual(baseline);
	expect(existsSync(join(f.root, "pending"))).toBe(true);
	expect(f.execute("deploy", { FAIL_RECOVERY: "1" }).stderr).toContain(
		"Recovery failed",
	);
});

test("status reports interruption without recreating a container", () => {
	const f = fixture();
	writeFileSync(join(f.root, "pending"), "interrupted\n");
	expect(f.execute("status").stdout).toContain("pending recovery");
	expect(f.calls()).not.toContain(" up ");
});

test("signal immediately after state commit recovers the committed pair instead of reverting behind state", () => {
	const f = fixture();
	writeFileSync(
		join(f.root, "bin/mv"),
		`#!/bin/bash
/usr/bin/mv "$@" || exit
if [[ "\${!#}" == "$MOCK_ROOT/state" && -f "$MOCK_ROOT/pending" ]]; then
  kill -TERM "$PPID"
fi
`,
	);
	chmodSync(join(f.root, "bin/mv"), 0o700);
	const result = f.execute("deploy");
	expect(result.status).not.toBe(0);
	expect(f.state()[2]).toBe("1");
	expect(JSON.parse(readFileSync(join(f.root, "active"), "utf8")).sha).toBe(
		newSha,
	);
	expect(existsSync(join(f.root, "pending"))).toBe(false);
});

test("SSH receiver transfers only release inputs and executes under the remote lock", () => {
	const f = fixture();
	writeFileSync(
		join(f.root, "bin/ssh"),
		`#!/bin/bash
set -euo pipefail
printf '%s\\n' "$@" > "$MOCK_ROOT/ssh-args"
remote_command="\${!#}"
tee "$MOCK_ROOT/upload.tar" | bash -c "$remote_command"
`,
	);
	chmodSync(join(f.root, "bin/ssh"), 0o700);
	const result = spawnSync("bash", [join(repo, "scripts/deploy-prod-ssh.sh")], {
		cwd: repo,
		encoding: "utf8",
		env: {
			...f.env,
			VPS_HOST: "synthetic.invalid",
			VPS_USER: "resora-deploy",
			VPS_PORT: "22",
			VPS_DEPLOY_PATH: f.root,
			VPS_SSH_KEY: "synthetic-key-never-upload",
			VPS_KNOWN_HOSTS: "synthetic-host-key",
			GITHUB_SHA: newSha,
			GITHUB_RUN_NUMBER: "1",
			WEB_DIGEST: digest("3"),
			SERVER_DIGEST: digest("4"),
		},
	});
	expect(result.status, result.stderr).toBe(0);
	expect(f.state()[2]).toBe("1");
	const sshArgs = readFileSync(join(f.root, "ssh-args"), "utf8");
	expect(sshArgs).toContain("StrictHostKeyChecking=yes");
	expect(sshArgs).not.toContain("synthetic-key-never-upload");
	const listing = spawnSync("tar", ["-tf", join(f.root, "upload.tar")], {
		encoding: "utf8",
	});
	expect(listing.stdout.trim().split("\n")).toEqual([
		"docker-compose.prod.yml",
		"scripts/deploy-prod.sh",
		"apps/web/.env.example",
		"apps/server/.env.example",
	]);
});
