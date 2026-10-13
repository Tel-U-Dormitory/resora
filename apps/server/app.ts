import type { Express } from "express";

import { createApp } from "./src/app";
import { ENV } from "./src/env.server";
import { auth, db } from "./src/services";

// Native Express entrypoint; the persistent Bun listener remains in src/index.ts.
const app: Express = createApp({ auth, db }, ENV.CORS_ORIGIN);
export default app;
