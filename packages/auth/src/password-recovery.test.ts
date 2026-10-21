import { expect, spyOn, test } from "bun:test";
import type { Database } from "@resora/db";
import { user as userTable } from "@resora/db/schema/auth";
import { userProfiles } from "@resora/db/schema/identity";
import { passwordResetAudit } from "@resora/db/schema/password-reset";
import { createAuth } from "./index";
import {
	genericResetResponse,
	type RecoveryOptions,
	resetPage,
	resetRequestIp,
} from "./password-recovery";
import { ResetMailError } from "./password-reset-mail";
import { requiresPasswordChange } from "./sr-access";

// Native Better Auth endpoints, hashing and hooks; isolated storage doubles, no network/SQL.
async function fixture(
	options: RecoveryOptions = {},
	enabled = true,
	limiter = false,
) {
	const target = {
		id: "synthetic-recovery",
		name: "Synthetic SR",
		email: "synthetic@example.invalid",
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
	const profile = {
		userId: target.id,
		actor: "SR",
		isActive: true,
		tenureStatus: "ACTIVE",
		mustChangePassword: true,
		passwordResetRequired: false,
		isSuperadmin: false,
		nim: "0000000001",
		srUserId: target.id as string | null,
		departmentCode: "RND",
		positionCode: "ANGGOTA",
		buildingId: "synthetic-building",
	};
	const audits: Record<string, unknown>[] = [];
	let failAudit = false;
	const db = {
		select: () => ({
			from: (table: unknown) => {
				const query = {
					leftJoin: () => query,
					innerJoin: () => query,
					where: async () =>
						table === userTable
							? [target]
							: table === userProfiles
								? [profile]
								: [{ userId: target.id }],
				};
				return query;
			},
		}),
		insert: (table: unknown) => ({
			values: async (values: Record<string, unknown>) => {
				expect(table).toBe(passwordResetAudit);
				if (failAudit) throw Error("synthetic-sensitive-database-error");
				audits.push(values);
			},
		}),
		update: () => ({
			set: (values: {
				mustChangePassword: boolean;
				passwordResetRequired?: boolean;
			}) => ({
				where: async () => {
					profile.mustChangePassword = values.mustChangePassword;
					if (values.passwordResetRequired !== undefined)
						profile.passwordResetRequired = values.passwordResetRequired;
				},
			}),
		}),
	} as unknown as Database;
	const links: string[] = [];
	const auth = createAuth(
		{
			BETTER_AUTH_URL: "https://web.example.test",
			CORS_ORIGIN: "https://web.example.test",
			BETTER_AUTH_SECRET: "synthetic-recovery-secret-000000000000000",
			NODE_ENV: "test",
			AUTH_RATE_LIMIT_ENABLED: limiter ? "true" : "false",
			PASSWORD_RESET_EMAIL_ENABLED: enabled ? "true" : "false",
		},
		db,
		[],
		{
			send: async (_to, link) => {
				links.push(link);
			},
			...options,
		},
	);
	const context = await auth.$context;
	const adapter = context.internalAdapter;
	type Verification = Awaited<ReturnType<typeof adapter.findVerificationValue>>;
	const tokens = new Map<string, NonNullable<Verification>>();
	adapter.findUserByEmail = async () => ({ user: target, accounts: [] });
	adapter.createVerificationValue = async (data) => {
		const row = {
			...data,
			id: data.identifier,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		tokens.set(data.identifier, row);
		return row;
	};
	adapter.findVerificationValue = async (key) => tokens.get(key) ?? null;
	// Keep native one-time consume/expiry logic; double only its adapter storage.
	context.adapter.transaction = async (callback) => callback(context.adapter);
	context.adapter.findMany = async ({ where }) =>
		[...tokens.values()].filter(
			(row) => row.identifier === where?.[0]?.value,
		) as never;
	context.adapter.consumeOne = async ({ where }) => {
		const row = [...tokens.values()].find(
			(value) => value.id === where?.[0]?.value,
		);
		if (!row) return null;
		tokens.delete(row.identifier);
		return row as never;
	};
	context.adapter.deleteMany = async () => 0;
	adapter.findUserById = async () => target;
	adapter.findCredentialAccount = async () => ({
		id: "credential",
		userId: target.id,
		providerId: "credential",
		accountId: target.id,
		createdAt: new Date(),
		updatedAt: new Date(),
		password: "old-hash",
	});
	let storedHash = "";
	let revoked = 0;
	adapter.updatePassword = async (_id, hash) => {
		storedHash = hash;
	};
	adapter.deleteUserSessions = async () => {
		revoked++;
	};
	const post = (
		path: string,
		body: unknown,
		origin = "https://web.example.test",
	) =>
		auth.handler(
			new Request(`https://web.example.test/api/auth/${path}`, {
				method: "POST",
				headers: {
					origin,
					"content-type": "application/json",
					"x-resora-client-ip": "192.0.2.50",
				},
				body: JSON.stringify(body),
			}),
		);
	return {
		auth,
		adapter,
		post,
		links,
		tokens,
		profile,
		audits,
		target,
		db,
		failAudit: () => {
			failAudit = true;
		},
		result: () => ({ storedHash, revoked }),
		token: () =>
			new URLSearchParams(
				new URL(links[0] ?? "https://web.example.test").hash.slice(1),
			).get("token") ?? "",
	};
}

test("public request is generic, audited once, native token expires in 15 minutes; no verification of imported email", async () => {
	const f = await fixture();
	const response = await f.post("request-password-reset", {
		email: f.target.email,
	});
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual(genericResetResponse);
	expect(f.links).toHaveLength(1);
	expect(new URL(f.links[0] ?? "").search).toBe("");
	expect([...f.tokens.values()][0]?.expiresAt.getTime()).toBeGreaterThan(
		Date.now() + 899000,
	);
	expect([...f.tokens.values()][0]?.expiresAt.getTime()).toBeLessThanOrEqual(
		Date.now() + 900000,
	);
	expect(f.audits.map((row) => row.eventType)).toEqual([
		"REQUESTED",
		"SMTP_ACCEPTED",
	]);
	expect(f.audits[1]?.requestId === f.audits[0]?.id).toBe(true);
	expect(f.audits[0]?.requestIp).toBe("192.0.2.50");
	expect(f.target.emailVerified).toBe(false);
	expect(JSON.stringify(f.audits)).not.toContain(f.token());
});

test("unknown, inactive, invalid assignment and disabled email requests disclose no account state and issue no token", async () => {
	for (const mode of ["unknown", "inactive", "invalid", "disabled"] as const) {
		const f = await fixture({}, mode !== "disabled");
		if (mode === "unknown") {
			// Query double supplies an empty user lookup, native endpoint is never called.
			f.db.select = (() => ({
				from: () => ({ where: async () => [] }),
			})) as unknown as Database["select"];
		}
		if (mode === "inactive") f.profile.isActive = false;
		if (mode === "invalid") {
			f.profile.departmentCode = "HCO";
			f.profile.positionCode = "KETUM";
		}
		const response = await f.post("request-password-reset", {
			email: f.target.email,
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(genericResetResponse);
		expect(f.tokens.size).toBe(0);
		expect(f.links).toHaveLength(0);
		expect(f.audits.map((row) => row.eventType)).toEqual(["REQUESTED"]);
	}
});

test("SMTP failure is sanitized and has the same public response", async () => {
	const f = await fixture({
		send: async () => {
			throw new ResetMailError("SMTP_AUTH");
		},
	});
	const response = await f.post("request-password-reset", {
		email: f.target.email,
	});
	expect(await response.json()).toEqual(genericResetResponse);
	expect(f.audits[1]).toMatchObject({
		eventType: "SMTP_FAILED",
		errorCode: "SMTP_AUTH",
	});
});

test("native reset hashes password, revokes sessions, clears flag once; reuse, expiry and deactivation rejected", async () => {
	const f = await fixture();
	await f.post("request-password-reset", { email: f.target.email });
	const token = f.token();
	expect(
		(await f.post("reset-password", { token, newPassword: "short" })).status,
	).toBe(400);
	expect(f.profile.mustChangePassword).toBe(true);
	expect(
		(
			await f.post("reset-password", {
				token,
				newPassword: "SyntheticReplacement42",
			})
		).status,
	).toBe(200);
	expect(f.profile.mustChangePassword).toBe(false);
	expect(f.result().revoked).toBe(1);
	expect(f.result().storedHash).not.toBe("SyntheticReplacement42");
	expect(
		await (await f.auth.$context).password.verify({
			hash: f.result().storedHash,
			password: "SyntheticReplacement42",
		}),
	).toBe(true);
	expect(
		f.audits.filter((row) => row.eventType === "RESET_COMPLETED"),
	).toHaveLength(1);
	expect(
		(
			await f.post("reset-password", {
				token,
				newPassword: "AnotherReplacement42",
			})
		).status,
	).toBe(400);
	await f.post("request-password-reset", { email: f.target.email });
	for (const row of f.tokens.values()) row.expiresAt = new Date(0);
	expect(
		(
			await f.post("reset-password", {
				token: new URLSearchParams(new URL(f.links[1] ?? "").hash.slice(1)).get(
					"token",
				),
				newPassword: "AnotherReplacement42",
			})
		).status,
	).toBe(400);
	await f.post("request-password-reset", { email: f.target.email });
	f.profile.isActive = false;
	expect(
		(
			await f.post("reset-password", {
				token: new URLSearchParams(new URL(f.links[2] ?? "").hash.slice(1)).get(
					"token",
				),
				newPassword: "AnotherReplacement42",
			})
		).status,
	).toBe(400);
});

test("SMTP recovery releases an administrator-reset gate only after successful native rotation", async () => {
	const f = await fixture();
	f.profile.passwordResetRequired = true;
	await f.post("request-password-reset", { email: f.target.email });
	expect(
		(await f.post("reset-password", { token: f.token(), newPassword: "short" }))
			.status,
	).toBe(400);
	expect(f.profile.passwordResetRequired).toBe(true);
	expect(
		(
			await f.post("reset-password", {
				token: f.token(),
				newPassword: "SyntheticReplacement42",
			})
		).status,
	).toBe(200);
	expect(f.profile.passwordResetRequired).toBe(false);
	expect(f.profile.mustChangePassword).toBe(false);
	expect(requiresPasswordChange({ ...f.profile, actor: "SR" })).toBe(false);
	expect(f.result().revoked).toBe(1);
	expect(
		f.audits.filter((row) => row.eventType === "RESET_COMPLETED"),
	).toHaveLength(1);
});

test("recovery requests and redemption enforce live SR tenure without account disclosure", async () => {
	for (const tenureStatus of ["EXPIRED", "SCHEDULED", "UNASSIGNED"]) {
		const f = await fixture();
		await f.post("request-password-reset", { email: f.target.email });
		const token = f.token();
		f.profile.tenureStatus = tenureStatus;
		const result = await f.post("request-password-reset", {
			email: f.target.email,
		});
		expect(result.status).toBe(200);
		expect(await result.json()).toEqual(genericResetResponse);
		expect(f.links).toHaveLength(1);
		expect(
			(
				await f.post("reset-password", {
					token,
					newPassword: "SyntheticReplacement42",
				})
			).status,
		).toBe(400);
		expect(f.result()).toEqual({ storedHash: "", revoked: 0 });
		expect(f.audits.some((row) => row.eventType === "RESET_COMPLETED")).toBe(
			false,
		);
	}
});

test("post-reset audit failure cannot falsely fail completed password change or prevent revocation", async () => {
	const f = await fixture();
	await f.post("request-password-reset", { email: f.target.email });
	const logger = spyOn(console, "error").mockImplementation(() => {});
	try {
		f.failAudit();
		expect(
			(
				await f.post("reset-password", {
					token: f.token(),
					newPassword: "SyntheticReplacement42",
				})
			).status,
		).toBe(200);
		expect(f.result().revoked).toBe(1);
		expect(logger.mock.calls).toEqual([
			["PASSWORD_RESET_AUDIT_FAILED", { eventType: "RESET_COMPLETED" }],
		]);
	} finally {
		logger.mockRestore();
	}
});

test("privileged SR and dedicated admin can complete rotation; revoked dedicated admin cannot redeem", async () => {
	for (const actor of ["SR", "SYSTEM_ADMIN"]) {
		const f = await fixture();
		f.profile.actor = actor;
		f.profile.isSuperadmin = true;
		if (actor === "SYSTEM_ADMIN") f.profile.srUserId = null;
		await f.post("request-password-reset", { email: f.target.email });
		expect(
			(
				await f.post("reset-password", {
					token: f.token(),
					newPassword: "SyntheticReplacement42",
				})
			).status,
		).toBe(200);
		expect(f.profile.mustChangePassword).toBe(false);
		if (actor === "SYSTEM_ADMIN") {
			await f.post("request-password-reset", { email: f.target.email });
			f.profile.isSuperadmin = false;
			expect(
				(
					await f.post("reset-password", {
						token: new URLSearchParams(
							new URL(f.links[1] ?? "").hash.slice(1),
						).get("token"),
						newPassword: "AnotherReplacement42",
					})
				).status,
			).toBe(400);
		}
	}
});

test("manual native issuance bypasses SMTP only via backend construction, audits issuance and yields a fresh link", async () => {
	const links: string[] = [];
	const f = await fixture(
		{
			manualLink: (link) => {
				links.push(link);
			},
			send: async () => {
				throw Error("SMTP must not run");
			},
		},
		false,
	);
	for (let i = 0; i < 2; i++)
		await f.auth.api.requestPasswordReset({ body: { email: f.target.email } });
	expect(links).toHaveLength(2);
	expect(links[0]).not.toBe(links[1]);
	expect(f.audits.map((row) => row.eventType)).toEqual([
		"MANUAL_LINK_ISSUED",
		"MANUAL_LINK_ISSUED",
	]);
	expect(f.audits.every((row) => row.source === "MANUAL")).toBe(true);
});

test("origin, redirect and endpoint restrictions remain in effect; request IP only uses trusted internal header", async () => {
	const f = await fixture();
	expect(
		(
			await f.post(
				"request-password-reset",
				{ email: f.target.email },
				"https://attacker.invalid",
			)
		).status,
	).toBe(403);
	expect(
		(
			await f.post("request-password-reset", {
				email: f.target.email,
				redirectTo: "https://attacker.invalid/reset",
			})
		).status,
	).toBe(400);
	expect((await f.post("sign-up/email", {})).status).toBe(403);
	expect(
		(
			await f.auth.handler(
				new Request(
					"https://web.example.test/api/auth/reset-password/secret?callbackURL=https://web.example.test",
				),
			)
		).status,
	).toBe(403);
	expect(
		resetRequestIp(
			new Request("https://example.test", {
				headers: { "x-forwarded-for": "192.0.2.1" },
			}),
		),
	).toBeNull();
	expect(resetPage("https://example.test")).toBe(
		"https://example.test/reset-password",
	);
	expect(() => resetPage("https://example.test/other")).toThrow();
});

test("reset request rate limiting runs before request audit; malformed input remains an error", async () => {
	const f = await fixture({}, true, true);
	for (let i = 0; i < 6; i++) {
		const response = await f.post("request-password-reset", {
			email: f.target.email,
		});
		expect(response.status).toBe(i < 5 ? 200 : 429);
	}
	expect(f.audits.filter((row) => row.eventType === "REQUESTED")).toHaveLength(
		5,
	);
	const malformed = await fixture();
	expect(
		(await malformed.post("request-password-reset", { email: "invalid" }))
			.status,
	).toBe(400);
});

test("native concurrent consumption permits one reset only", async () => {
	const f = await fixture();
	await f.post("request-password-reset", { email: f.target.email });
	const responses = await Promise.all(
		[1, 2].map(() =>
			f.post("reset-password", {
				token: f.token(),
				newPassword: "SyntheticReplacement42",
			}),
		),
	);
	expect(responses.map((response) => response.status).sort()).toEqual([
		200, 400,
	]);
	expect(f.result().revoked).toBe(1);
});

test("SMTP background lifetime does not delay generic response or change unrelated auth behavior", async () => {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	const tasks: Promise<unknown>[] = [];
	const f = await fixture({
		send: async () => pending,
		backgroundTask: (work) => {
			tasks.push(work);
		},
	});
	const response = await f.post("request-password-reset", {
		email: f.target.email,
	});
	expect(response.status).toBe(200);
	expect(tasks).toHaveLength(1);
	expect(f.audits.map((row) => row.eventType)).toEqual(["REQUESTED"]);
	release();
	await Promise.all(tasks);
	expect(f.audits[1]?.eventType).toBe("SMTP_ACCEPTED");
	expect(f.auth.options.advanced).not.toHaveProperty("backgroundTasks");
});

test("overlapping requests for the same email have distinct server-generated audit correlation", async () => {
	const f = await fixture({
		send: async () => {
			throw new ResetMailError("SMTP_CONNECT");
		},
	});
	await Promise.all(
		[1, 2].map(() =>
			f.post("request-password-reset", { email: f.target.email }),
		),
	);
	const requests = f.audits.filter((row) => row.eventType === "REQUESTED");
	const failures = f.audits.filter((row) => row.eventType === "SMTP_FAILED");
	expect(requests).toHaveLength(2);
	expect(failures).toHaveLength(2);
	expect(new Set(requests.map((row) => row.requestId)).size).toBe(2);
	for (const row of requests) {
		expect(row.requestId === row.id).toBe(true);
		expect(
			failures.filter((failure) => failure.requestId === row.id),
		).toHaveLength(1);
	}
});
