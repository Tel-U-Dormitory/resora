import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

function getServerUrl(url: string) {
	const processEnv = typeof process === "undefined" ? undefined : process.env;
	if (typeof window === "undefined" && processEnv?.SERVER_URL) {
		return processEnv.SERVER_URL.endsWith("/")
			? processEnv.SERVER_URL.slice(0, -1)
			: processEnv.SERVER_URL;
	}

	return url.endsWith("/") ? url.slice(0, -1) : url;
}

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
if (!serverUrl) throw new Error("Server URL is not configured");

export const authClient = createAuthClient({
	plugins: [usernameClient()],
	baseURL: new URL("/api/auth", getServerUrl(serverUrl)).toString(),
});
