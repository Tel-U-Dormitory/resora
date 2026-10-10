import { createAuth } from "@resora/auth";
import { createDb } from "@resora/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
