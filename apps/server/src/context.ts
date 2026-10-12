import type { Context as ApiContext } from "@resora/api/context";
import type { Auth } from "@resora/auth";
import type { Database } from "@resora/db";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { APIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";

export async function createContext(
	services: { db: Database; auth: Auth },
	opts: CreateExpressContextOptions,
): Promise<ApiContext> {
	const { auth, db } = services;
	let session = null;
	try {
		session = await auth.api.getSession({
			headers: fromNodeHeaders(opts.req.headers),
			query: { disableCookieCache: true },
		});
	} catch (error) {
		if (!(error instanceof APIError) || error.statusCode !== 401) throw error;
	}
	return {
		db,
		session,
		qrSigningSecret: auth.options.secret,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
