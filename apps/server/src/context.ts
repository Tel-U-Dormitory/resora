import type { Context as ApiContext } from "@resora/api/context";
import type { Auth, AuthConfig } from "@resora/auth";
import type { Database } from "@resora/db";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { APIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";

export async function createContext(
	services: {
		db: Database;
		auth: Auth;
		authConfig?: AuthConfig;
		authPerfDiagnosticsEnabled?: boolean;
	},
	opts: Pick<CreateExpressContextOptions, "req" | "res">,
): Promise<ApiContext> {
	const { auth, db } = services;
	let session = null;
	const sessionStarted = services.authPerfDiagnosticsEnabled
		? performance.now()
		: null;
	try {
		session = await auth.api.getSession({
			headers: fromNodeHeaders(opts.req.headers),
			query: { disableCookieCache: true },
		});
	} catch (error) {
		if (!(error instanceof APIError) || error.statusCode !== 401) throw error;
	} finally {
		// One scalar per HTTP context, including storage failures; no session data
		// or additional retrieval. Do not change the authoritative read's behavior.
		if (sessionStarted !== null)
			opts.res.locals.authSessionDurationMs = Math.max(
				0,
				Math.round(performance.now() - sessionStarted),
			);
	}
	return {
		db,
		session,
		qrSigningSecret: auth.options.secret,
		authConfig: services.authConfig,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
