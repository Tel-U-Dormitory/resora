export function getServerUrl(url: string | undefined) {
	const processEnv = typeof process === "undefined" ? undefined : process.env;
	if (typeof window === "undefined" && processEnv?.SERVER_URL) {
		return processEnv.SERVER_URL.endsWith("/")
			? processEnv.SERVER_URL.slice(0, -1)
			: processEnv.SERVER_URL;
	}

	if (!url) throw new Error("Server URL is not configured");
	return url.endsWith("/") ? url.slice(0, -1) : url;
}
