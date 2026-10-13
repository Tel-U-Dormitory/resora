import { fileURLToPath } from "node:url";
// Keep native Express framework detection without importing TypeScript source.
import "express";

// Monorepo Functions can start above this directory; Varlock loads this API schema.
process.chdir(fileURLToPath(new URL(".", import.meta.url)));
const { default: app } = await import("./dist/app.mjs");
export default app;
