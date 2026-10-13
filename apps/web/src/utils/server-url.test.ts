/// <reference types="bun" />

import { afterEach, beforeEach, expect, test } from "bun:test";

import { getServerUrl } from "./server-url";

let originalUrl: string | undefined;
let windowDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
	originalUrl = process.env.SERVER_URL;
	windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
	delete process.env.SERVER_URL;
	Reflect.deleteProperty(globalThis, "window");
});
afterEach(() => {
	if (originalUrl === undefined) delete process.env.SERVER_URL;
	else process.env.SERVER_URL = originalUrl;
	if (windowDescriptor)
		Object.defineProperty(globalThis, "window", windowDescriptor);
	else Reflect.deleteProperty(globalThis, "window");
});

test("public URL handling keeps the configured endpoint and trims a trailing slash", () => {
	expect(getServerUrl("http://localhost:3000/")).toBe("http://localhost:3000");
	expect(getServerUrl("http://localhost:3000")).toBe("http://localhost:3000");
});

test("SSR continues to prefer SERVER_URL, including without a public URL", () => {
	process.env.SERVER_URL = "http://127.0.0.1:3000/";
	expect(getServerUrl("http://localhost:3000")).toBe("http://127.0.0.1:3000");
	expect(getServerUrl(undefined)).toBe("http://127.0.0.1:3000");
});

test("the browser uses only the public endpoint", () => {
	Object.defineProperty(globalThis, "window", {
		value: {},
		configurable: true,
	});
	process.env.SERVER_URL = "http://127.0.0.1:3000/";
	expect(getServerUrl("http://localhost:3000/")).toBe("http://localhost:3000");
	expect(() => getServerUrl(undefined)).toThrow("Server URL is not configured");
});

test("missing or empty URL fails with a generic configuration error", () => {
	for (const url of [undefined, ""]) {
		expect(() => getServerUrl(url)).toThrow("Server URL is not configured");
	}
});

test("same-origin browser routing uses the current web host, including preview hosts", () => {
	Object.defineProperty(globalThis, "window", {
		value: { location: { origin: "https://preview.example.test" } },
		configurable: true,
	});
	process.env.SERVER_URL = "https://api.example.test";
	expect(getServerUrl("/")).toBe("https://preview.example.test");
});

test("same-origin SSR requires an explicit backend rather than resolving relative URLs", () => {
	expect(() => getServerUrl("/")).toThrow("SERVER_URL is required");
	process.env.SERVER_URL = "https://api.example.test/";
	expect(getServerUrl("/")).toBe("https://api.example.test");
});
