import type { AppRouter } from "@resora/api/routers/index";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { headers } from "next/headers";

// SSR goes through Express too; never import a DB client into Next.js.
export async function getSrSession() {
	const requestHeaders = await headers();
	const client = createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${(process.env.SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || "").replace(/\/$/, "")}/trpc`,
				headers: { cookie: requestHeaders.get("cookie") || "" },
			}),
		],
	});
	try {
		return await client.identity.session.query();
	} catch {
		return null;
	} // Fail closed if the backend cannot verify identity.
}
