import type { Database } from "@resora/db";
import { userProfiles } from "@resora/db/schema/identity";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { type AuthConfig, createAuth } from "./index";

// Public password changes share the administrator-reset profile lock. Keep the native
// credential verification, session replacement and gate release in one transaction.
export async function handlePasswordChangeRequest(
	config: AuthConfig,
	db: Database,
	request: Request,
) {
	const origin = request.headers.get("origin");
	if (
		!origin ||
		![
			new URL(config.BETTER_AUTH_URL).origin,
			new URL(config.CORS_ORIGIN).origin,
		].includes(origin)
	)
		return createAuth(config, db).handler(request); // Native trusted-origin denial, before session work.
	try {
		return await db.transaction(async (tx) => {
			const auth = createAuth(config, tx);
			const session = await auth.api.getSession({ headers: request.headers });
			if (session)
				await tx
					.select({ userId: userProfiles.userId })
					.from(userProfiles)
					.where(eq(userProfiles.userId, session.user.id))
					.for("update");
			// Revalidates the session after any wait; reset may have revoked it meanwhile.
			const response = await auth.handler(request);
			// Native 400 validation/password-mismatch paths precede credential writes.
			// Commit their database limiter counters; roll back errors after possible writes.
			if (!response.ok && response.status !== 400) throw response;
			return response;
		});
	} catch (error) {
		if (error instanceof Response) return error;
		if (error instanceof APIError && error.statusCode === 401)
			return Response.json(
				{ code: "UNAUTHORIZED", message: "Authentication required" },
				{ status: 401 },
			);
		throw error;
	}
}
