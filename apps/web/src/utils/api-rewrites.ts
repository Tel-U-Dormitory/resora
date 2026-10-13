export function getApiRewrites(upstream: string | undefined) {
	if (!upstream) return [];
	const url = new URL(upstream);
	if (
		!["http:", "https:"].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	) {
		throw new Error(
			"API_UPSTREAM_URL must be an HTTP(S) origin without credentials or a path",
		);
	}
	return [
		{
			source: "/api/auth/:path*",
			destination: `${url.origin}/api/auth/:path*`,
		},
		{ source: "/trpc/:path*", destination: `${url.origin}/trpc/:path*` },
	];
}
