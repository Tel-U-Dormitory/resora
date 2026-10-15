import type { AppRouter } from "@resora/api/routers/index";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { headers } from "next/headers";
import { cache } from "react";
import { getServerUrl } from "@/utils/server-url";

// Share only within a React server render (layout/page), never across requests.
// SSR still goes through Express; never import a DB client into Next.js.
export const getSrSession = cache(async () => {
	const requestHeaders = await headers();
	const client = createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${getServerUrl(process.env.NEXT_PUBLIC_SERVER_URL)}/trpc`,
				headers: { cookie: requestHeaders.get("cookie") || "" },
				fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }),
			}),
		],
	});
	try {
		return await client.identity.session.query();
	} catch {
		return null;
	} // Fail closed if the backend cannot verify identity.
});
