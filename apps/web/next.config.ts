import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();

import type { NextConfig } from "next";
import { getApiRewrites } from "./src/utils/api-rewrites";

const nextConfig: NextConfig = {
	typedRoutes: true,
	reactCompiler: true,
	output: "standalone",
	poweredByHeader: false,
	async rewrites() {
		return getApiRewrites(process.env.API_UPSTREAM_URL);
	},
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "X-Frame-Options", value: "DENY" },
					{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
					{
						key: "Permissions-Policy",
						value: "camera=(self), geolocation=(self), microphone=()",
					},
				],
			},
		];
	},
};

export default withVarlock(nextConfig);
