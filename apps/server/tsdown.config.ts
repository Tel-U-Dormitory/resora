import { defineConfig } from "tsdown";

export default defineConfig({
	entry: { index: "./src/index.ts", app: "./src/vercel-app.ts" },
	format: "esm",
	outDir: "./dist",
	clean: true,
	deps: {
		alwaysBundle: [/@resora\/.*/],
	},
});
