import { expect, test } from "bun:test";

import { getApiRewrites } from "./api-rewrites";

test("same-origin proxy covers auth and tRPC only and keeps backend paths", () => {
	expect(getApiRewrites("https://api.example.test/")).toEqual([
		{
			source: "/api/auth/:path*",
			destination: "https://api.example.test/api/auth/:path*",
		},
		{
			source: "/trpc/:path*",
			destination: "https://api.example.test/trpc/:path*",
		},
	]);
	expect(getApiRewrites(undefined)).toEqual([]);
});

test("upstream must not embed credentials, paths, query strings or non-HTTP schemes", () => {
	for (const upstream of [
		"https://user:synthetic@api.example.test",
		"https://api.example.test/path",
		"https://api.example.test?key=synthetic",
		"https://api.example.test#fragment",
		"ftp://api.example.test",
	]) {
		expect(() => getApiRewrites(upstream)).toThrow(
			"HTTP(S) origin without credentials or a path",
		);
	}
});
