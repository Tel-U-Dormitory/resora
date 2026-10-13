import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { getServerUrl } from "@/utils/server-url";

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
if (!serverUrl) throw new Error("Server URL is not configured");

export const authClient = createAuthClient({
	plugins: [usernameClient()],
	baseURL: new URL("/api/auth", getServerUrl(serverUrl)).toString(),
});
