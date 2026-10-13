export function getServerUrl(url: string | undefined) {
	const processEnv = typeof process === "undefined" ? undefined : process.env;
	if (typeof window === "undefined" && processEnv?.SERVER_URL) {
		return processEnv.SERVER_URL.endsWith("/")
			? processEnv.SERVER_URL.slice(0, -1)
			: processEnv.SERVER_URL;
	}

	if (!url) throw new Error("Server URL is not configured");
	if (url === "/") {
		if (typeof window === "undefined") {
			throw new Error("SERVER_URL is required for same-origin SSR");
		}
		return window.location.origin;
	}
	return url.endsWith("/") ? url.slice(0, -1) : url;
}
