import { createAuthClient } from "better-auth/react";

function getServerUrl(url?: string) {
  const processEnv = typeof process === "undefined" ? undefined : process.env;
  if (typeof window === "undefined" && processEnv?.SERVER_URL) {
    return processEnv.SERVER_URL.endsWith("/")
      ? processEnv.SERVER_URL.slice(0, -1)
      : processEnv.SERVER_URL;
  }

  const target = url || "http://localhost:3000";
  return target.endsWith("/") ? target.slice(0, -1) : target;
}

export const authClient = createAuthClient({
  baseURL: new URL("/api/auth", getServerUrl(process.env.NEXT_PUBLIC_SERVER_URL!)).toString(),
});
