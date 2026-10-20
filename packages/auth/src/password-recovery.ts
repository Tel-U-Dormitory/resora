import { isIP } from "node:net";
import type { Database, DatabaseTransaction } from "@resora/db";
import { isValidSrAssignment } from "@resora/db/organization";
import { account, user } from "@resora/db/schema/auth";
import {
	buildings,
	departments,
	positions,
	srProfiles,
	userProfiles,
} from "@resora/db/schema/identity";
import { passwordResetAudit } from "@resora/db/schema/password-reset";
import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	ResetMailError,
	type SmtpConfig,
	sendResetMail,
} from "./password-reset-mail";
import { getActiveIdentity } from "./sr-access";

type Db = Database | DatabaseTransaction;
type Audit = typeof passwordResetAudit.$inferInsert;
export type RecoveryOptions = {
	// Backend construction only, never selected by an HTTP header/body.
	manualLink?: (link: string) => void;
	send?: (to: string, link: string) => Promise<void>;
	backgroundTask?: (work: Promise<unknown>) => void;
};
export const resetRequestSchema = z.object({
	email: z.email().transform((email) => email.toLowerCase()),
	redirectTo: z.string().optional(),
});
export const genericResetResponse = {
	status: true,
	message: "Jika email terdaftar, tautan reset password akan dikirimkan.",
};
export function resetPage(origin: string) {
	const url = new URL(origin);
	if (
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash ||
		(url.protocol !== "https:" &&
			!(
				url.protocol === "http:" &&
				["localhost", "127.0.0.1"].includes(url.hostname)
			))
	)
		throw Error("INVALID_RESET_APPLICATION_ORIGIN");
	return new URL("/reset-password", url).href;
}
export function resetRequestIp(request?: Request) {
	// Express always overwrites this header via the existing trusted IP resolver.
	// No forwarding headers, request bodies or arbitrary URLs are used.
	const ip = request?.headers.get("x-resora-client-ip");
	return ip && isIP(ip) ? ip : null;
}
export async function recoveryEligible(db: Db, userId: string) {
	const identity = await getActiveIdentity(db, userId);
	if (!identity) return false;
	if (identity.actor === "SR") {
		if (!isValidSrAssignment(identity.departmentCode, identity.positionCode))
			return false;
		const [refs] = await db
			.select({ userId: srProfiles.userId })
			.from(srProfiles)
			.innerJoin(departments, eq(departments.code, srProfiles.departmentCode))
			.innerJoin(positions, eq(positions.code, srProfiles.positionCode))
			.innerJoin(buildings, eq(buildings.id, srProfiles.buildingId))
			.where(
				and(
					eq(srProfiles.userId, userId),
					eq(departments.isActive, true),
					eq(positions.isActive, true),
					eq(buildings.isActive, true),
				),
			);
		if (!refs) return false;
	}
	const [credential] = await db
		.select({ userId: account.userId })
		.from(account)
		.where(
			and(eq(account.userId, userId), eq(account.providerId, "credential")),
		);
	return !!credential;
}
export async function recoveryUser(
	db: Db,
	selector: { email: string } | { username: string },
) {
	const [found] = await db
		.select({ id: user.id, email: user.email })
		.from(user)
		.where(
			"email" in selector
				? eq(user.email, selector.email.toLowerCase())
				: eq(user.username, selector.username),
		);
	return found;
}
export function createPasswordRecovery(
	db: Db,
	env: SmtpConfig & {
		CORS_ORIGIN: string;
		PASSWORD_RESET_EMAIL_ENABLED?: "true" | "false";
	},
	options: RecoveryOptions = {},
) {
	if (
		env.PASSWORD_RESET_EMAIL_ENABLED !== undefined &&
		!["true", "false"].includes(env.PASSWORD_RESET_EMAIL_ENABLED)
	)
		throw Error("INVALID_PASSWORD_RESET_EMAIL_ENABLED");
	// Evaluate lazily: legacy local CLI/test origins remain untouched until recovery is used.
	const page = () => resetPage(env.CORS_ORIGIN);
	const source = options.manualLink ? ("MANUAL" as const) : ("PUBLIC" as const);
	// Server-generated, request-scoped correlation; never derived from a reset token.
	const requests = new WeakMap<Request, string>();
	async function audit(
		event: Pick<
			Audit,
			"id" | "eventType" | "targetEmail" | "userId" | "errorCode"
		>,
		request?: Request,
	) {
		await db.insert(passwordResetAudit).values({
			...event,
			source,
			requestIp: resetRequestIp(request),
			requestId: request ? requests.get(request) : undefined,
		});
	}
	async function bestEffortAudit(
		event: Parameters<typeof audit>[0],
		request?: Request,
	) {
		try {
			await audit(event, request);
		} catch {
			console.error("PASSWORD_RESET_AUDIT_FAILED", {
				eventType: event.eventType,
			});
		}
	}
	return {
		page,
		async request(
			input: z.infer<typeof resetRequestSchema>,
			request?: Request,
		) {
			if (input.redirectTo && input.redirectTo !== page())
				throw new APIError("BAD_REQUEST", {
					code: "INVALID_RESET_REDIRECT",
					message: "Invalid reset redirect",
				});
			const found = await recoveryUser(db, { email: input.email });
			const id = randomUUID();
			if (request) requests.set(request, id);
			if (!options.manualLink)
				await audit(
					{
						id,
						eventType: "REQUESTED",
						userId: found?.id,
						targetEmail: input.email,
					},
					request,
				);
			return (
				!!found &&
				(env.PASSWORD_RESET_EMAIL_ENABLED === "true" || !!options.manualLink) &&
				(await recoveryEligible(db, found.id))
			);
		},
		async assertReset(userId: string) {
			if (!(await recoveryEligible(db, userId)))
				throw new APIError("BAD_REQUEST", {
					code: "INVALID_TOKEN",
					message: "Invalid token",
				});
		},
		async send(
			{
				user: target,
				token,
			}: { user: { id: string; email: string }; token: string },
			request?: Request,
		) {
			if (!(await recoveryEligible(db, target.id))) return;
			const link = new URL(page());
			link.hash = new URLSearchParams({ token }).toString();
			if (options.manualLink) {
				await audit({
					eventType: "MANUAL_LINK_ISSUED",
					userId: target.id,
					targetEmail: target.email,
				});
				options.manualLink(link.href);
				return;
			}
			try {
				await (options.send ?? ((to, url) => sendResetMail(env, to, url)))(
					target.email,
					link.href,
				);
			} catch (error) {
				await bestEffortAudit(
					{
						eventType: "SMTP_FAILED",
						userId: target.id,
						targetEmail: target.email,
						errorCode:
							error instanceof ResetMailError ? error.code : "SMTP_SEND",
					},
					request,
				);
				return; // Same public response whether SMTP succeeds or fails.
			}
			await bestEffortAudit(
				{
					eventType: "SMTP_ACCEPTED",
					userId: target.id,
					targetEmail: target.email,
				},
				request,
			);
		},
		async completed(
			{ user: target }: { user: { id: string; email: string } },
			request?: Request,
		) {
			try {
				await db
					.update(userProfiles)
					.set({ mustChangePassword: false })
					.where(
						and(
							eq(userProfiles.userId, target.id),
							eq(userProfiles.isActive, true),
						),
					);
			} catch {
				console.error("PASSWORD_RESET_FLAG_UPDATE_FAILED");
			}
			// Never throw a post-update callback error. Real SQL failures still abort
			// the enclosing reset transaction, so its credential/token writes roll back.
			await bestEffortAudit(
				{
					eventType: "RESET_COMPLETED",
					userId: target.id,
					targetEmail: target.email,
				},
				request,
			);
		},
	};
}

import { randomUUID } from "node:crypto";
