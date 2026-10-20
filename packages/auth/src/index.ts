import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database, DatabaseTransaction } from "@resora/db";
import * as schema from "@resora/db/schema/auth";
import { userProfiles } from "@resora/db/schema/identity";
import { betterAuth } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	getSessionFromCtx,
	resetPassword,
} from "better-auth/api";
import { username } from "better-auth/plugins";
import { and, eq, inArray } from "drizzle-orm";
import {
	createPasswordRecovery,
	genericResetResponse,
	type RecoveryOptions,
	resetRequestSchema,
} from "./password-recovery";
import type { SmtpConfig } from "./password-reset-mail";
import { getActiveIdentity, requiresPasswordChange } from "./sr-access";

export type AuthConfig = SmtpConfig & {
	BETTER_AUTH_URL: string;
	BETTER_AUTH_SECRET: string;
	CORS_ORIGIN: string;
	NODE_ENV?: string;
	AUTH_RATE_LIMIT_ENABLED?: "true" | "false";
	PASSWORD_RESET_EMAIL_ENABLED?: "true" | "false";
};

// 1.7.7 consumes the token in its own transaction, but does not transact the
// entire reset endpoint. Keep its native implementation and bind all writes
// (including our completion callback) to one Drizzle transaction.
function transactionalReset(
	database: Database | DatabaseTransaction,
	env: AuthConfig,
	desktopOrigins: readonly string[],
	recoveryOptions: RecoveryOptions,
): typeof resetPassword {
	return createAuthEndpoint(
		"/reset-password",
		resetPassword.options,
		async (ctx) => {
			// createAuth(env, tx) already participates in its caller's transaction.
			if (!("$client" in database))
				return resetPassword({
					...ctx,
					asResponse: false,
					returnHeaders: false,
					returnStatus: false,
				});
			return database.transaction(async (tx) => {
				const context = await createAuth(
					env,
					tx,
					desktopOrigins,
					recoveryOptions,
				).$context;
				const verification =
					await context.internalAdapter.findVerificationValue(
						`reset-password:${ctx.body.token}`,
					);
				if (!verification)
					throw new APIError("BAD_REQUEST", {
						code: "INVALID_TOKEN",
						message: "Invalid token",
					});
				await createPasswordRecovery(tx, env, recoveryOptions).assertReset(
					verification.value,
				);
				return resetPassword({
					...ctx,
					asResponse: false,
					returnHeaders: false,
					returnStatus: false,
					context: { ...ctx.context, ...context },
				});
			});
		},
	);
}

export function createAuth(
	env: AuthConfig,
	database: Database | DatabaseTransaction,
	desktopOrigins: readonly string[] = [],
	recoveryOptions: RecoveryOptions = {},
) {
	const recovery = createPasswordRecovery(database, env, recoveryOptions);
	if (
		env.AUTH_RATE_LIMIT_ENABLED !== undefined &&
		env.AUTH_RATE_LIMIT_ENABLED !== "true" &&
		env.AUTH_RATE_LIMIT_ENABLED !== "false"
	) {
		throw new Error("AUTH_RATE_LIMIT_ENABLED must be true or false");
	}
	const trustedOrigins = [env.CORS_ORIGIN, ...desktopOrigins];
	const allowedOrigins = new Set([
		new URL(env.BETTER_AUTH_URL).origin,
		new URL(env.CORS_ORIGIN).origin,
		...desktopOrigins,
	]);
	const allowedPaths = new Set([
		"/sign-in/username",
		"/get-session",
		"/sign-out",
		"/change-password",
		"/list-sessions",
		"/revoke-session",
		"/revoke-other-sessions",
		"/request-password-reset",
		"/reset-password",
	]);
	const passwordGatePaths = new Set([
		"/get-session",
		"/sign-out",
		"/change-password",
	]);
	return betterAuth({
		database: drizzleAdapter(database, {
			provider: "pg",
			schema,
			transaction: true,
		}),
		trustedOrigins,
		emailAndPassword: {
			enabled: true,
			disableSignUp: true,
			resetPasswordTokenExpiresIn: 900,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async (data, request) => {
				if (!recoveryOptions.backgroundTask || recoveryOptions.manualLink) {
					await recovery.send(data, request);
					return;
				}
				// Background only SMTP, never unrelated session/auth operations.
				recoveryOptions.backgroundTask(recovery.send(data, request));
			},
			onPasswordReset: recovery.completed,
		},
		session: { cookieCache: { enabled: false } },
		logger: { disabled: true },
		rateLimit: {
			enabled: env.AUTH_RATE_LIMIT_ENABLED !== "false",
			// When enabled, Production shares counters through the supported Drizzle adapter.
			// Missing schema/DB errors fail the request; there is no memory fallback.
			storage:
				env.NODE_ENV === "production" || process.env.NODE_ENV === "production"
					? "database"
					: "memory",
			customRules: {
				"/sign-in/username": { window: 60, max: 75 },
				"/change-password": { window: 60, max: 75 },
				"/request-password-reset": { window: 60, max: 5 },
				"/reset-password": { window: 60, max: 10 },
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			ipAddress: { ipAddressHeaders: ["x-resora-client-ip"] },
			defaultCookieAttributes: {
				sameSite: "lax",
				secure: new URL(env.BETTER_AUTH_URL).protocol === "https:",
				httpOnly: true,
			},
		},
		databaseHooks: {
			session: {
				create: {
					before: async (session) => {
						if (!(await getActiveIdentity(database, session.userId))) {
							throw new APIError("UNAUTHORIZED", {
								code: "INVALID_USERNAME_OR_PASSWORD",
								message: "Invalid username or password",
							});
						}
						return { data: session };
					},
				},
			},
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				// Login has no session cookie yet; enforce origin before any credential work.
				if (ctx.request && ctx.method !== "GET") {
					const origin = ctx.headers?.get("origin");
					if (!origin || !allowedOrigins.has(origin)) {
						throw new APIError("FORBIDDEN", {
							code: "INVALID_ORIGIN",
							message: "Request origin is not allowed",
						});
					}
				}
				// Restrict public auth capabilities, not internal authorized provisioning.
				if (!allowedPaths.has(ctx.path)) {
					throw new APIError("FORBIDDEN", {
						code: "PILOT_AUTH_ONLY",
						message: "This authentication operation is unavailable",
					});
				}
				if (ctx.path === "/request-password-reset") {
					const parsed = resetRequestSchema.safeParse(ctx.body);
					if (!parsed.success) return; // Native schema supplies malformed-input errors.
					if (!(await recovery.request(parsed.data, ctx.request)))
						return ctx.json(genericResetResponse);
					return {
						context: {
							...ctx,
							body: { ...parsed.data, redirectTo: recovery.page() },
						},
					};
				}
				if (ctx.path === "/reset-password") {
					const token = ctx.body?.token;
					if (
						typeof token !== "string" ||
						!token ||
						token.length > 256 ||
						ctx.query?.token
					)
						throw new APIError("BAD_REQUEST", {
							code: "INVALID_TOKEN",
							message: "Invalid token",
						});
					const verification =
						await ctx.context.internalAdapter.findVerificationValue(
							`reset-password:${token}`,
						);
					if (!verification || verification.expiresAt <= new Date())
						throw new APIError("BAD_REQUEST", {
							code: "INVALID_TOKEN",
							message: "Invalid token",
						});
					await recovery.assertReset(verification.value);
					return;
				}
				// get-session performs its own authoritative lookup; validate identity after it.
				if (
					ctx.path === "/sign-in/username" ||
					ctx.path === "/sign-out" ||
					ctx.path === "/get-session"
				)
					return;
				const session = await getSessionFromCtx(ctx, {
					disableCookieCache: true,
				});
				if (!session) return; // Native endpoints handle missing/expired sessions.
				const profile = await getActiveIdentity(database, session.user.id);
				if (!profile) {
					throw new APIError("UNAUTHORIZED", {
						code: "UNAUTHORIZED",
						message: "Authentication required",
					});
				}
				if (
					requiresPasswordChange(profile) &&
					!passwordGatePaths.has(ctx.path)
				) {
					throw new APIError("FORBIDDEN", {
						code: "PASSWORD_CHANGE_REQUIRED",
						message: "Password change required",
					});
				}
				if (ctx.path === "/change-password") {
					const body = ctx.body;

					if (
						typeof body !== "object" ||
						body === null ||
						Array.isArray(body) ||
						!("newPassword" in body) ||
						!("currentPassword" in body) ||
						typeof body.newPassword !== "string" ||
						typeof body.currentPassword !== "string"
					) {
						// Let Better Auth validate malformed request bodies.
						return;
					}

					if (body.newPassword === body.currentPassword) {
						throw new APIError("BAD_REQUEST", {
							code: "NEW_PASSWORD_REQUIRED",
							message: "Choose a different password",
						});
					}

					return {
						context: {
							...ctx,
							body: { ...body, revokeOtherSessions: true },
						},
					};
				}
			}),
			after: createAuthMiddleware(async (ctx) => {
				if (
					ctx.path === "/request-password-reset" &&
					!(ctx.context.returned instanceof APIError)
				) {
					return ctx.json(genericResetResponse);
				}
				if (ctx.path === "/get-session") {
					const result = ctx.context.returned;
					if (
						!result ||
						result instanceof APIError ||
						typeof result !== "object" ||
						!("user" in result)
					)
						return;
					const userId = ctx.context.session?.user.id;
					if (!userId || !(await getActiveIdentity(database, userId))) {
						throw new APIError("UNAUTHORIZED", {
							code: "UNAUTHORIZED",
							message: "Authentication required",
						});
					}
					return;
				}
				if (
					ctx.path !== "/change-password" ||
					ctx.context.returned instanceof APIError
				)
					return;
				const result = ctx.context.returned;
				const userId = ctx.context.session?.user.id;
				if (
					!userId ||
					!result ||
					typeof result !== "object" ||
					!("user" in result)
				)
					return;
				// Clear only after Better Auth verifies the old password and completes rotation.
				// Failure leaves the gate closed; never mark completion before credential success.
				const [updated] = await database
					.update(userProfiles)
					.set({ mustChangePassword: false })
					.where(
						and(
							eq(userProfiles.userId, userId),
							inArray(userProfiles.actor, ["SR", "SYSTEM_ADMIN"]),
							eq(userProfiles.isActive, true),
						),
					)
					.returning({ userId: userProfiles.userId });
				if (!updated)
					throw new APIError("UNAUTHORIZED", {
						code: "UNAUTHORIZED",
						message: "Authentication required",
					});
			}),
		},
		plugins: [
			username({
				usernameNormalization: false,
				immutableUsername: true,
			}),
			{
				id: "transactional-password-reset",
				endpoints: {
					resetPassword: transactionalReset(
						database,
						env,
						desktopOrigins,
						recoveryOptions,
					),
				},
			},
		],
	});
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
export type Auth = ReturnType<typeof createAuth>;
