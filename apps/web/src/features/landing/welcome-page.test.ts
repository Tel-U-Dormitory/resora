import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ASTRA_GREETINGS, ASTRI_GREETINGS } from "./mascot-stage";

test("Astra and Astri greeting collections contain authentic messages", () => {
	expect(ASTRA_GREETINGS.length).toBeGreaterThan(0);
	expect(ASTRI_GREETINGS.length).toBeGreaterThan(0);

	expect(ASTRA_GREETINGS.some((msg) => msg.includes("Astra"))).toBe(true);
	expect(ASTRI_GREETINGS.some((msg) => msg.includes("Astri"))).toBe(true);
});

test("welcome-page uses styled-components 3D flip switch below mascot, removed top tabs, and strictly has Login SR button", () => {
	const content = readFileSync(
		new URL("welcome-page.tsx", import.meta.url),
		"utf8",
	);

	// dvh responsiveness
	expect(content).toContain("h-dvh");
	expect(content).toContain("max-h-dvh");

	// Default Astra state
	expect(content).toContain('useState<MascotMode>("astra")');

	// Top tabs are removed
	expect(content).not.toContain('id="tab-astra"');
	expect(content).not.toContain('id="tab-astri"');
	expect(content).not.toContain('role="tablist"');

	// Uses styled MascotSwitch 3D flip toggle below the mascot
	expect(content).toContain('import { MascotSwitch } from "./mascot-switch"');
	expect(content).toContain('id="mascot-flip-switch"');

	// Strictly points to /login with Login SR button
	expect(content).toContain('href="/login"');
	expect(content).toContain("Login SR");
	expect(content).toContain("login-sr-button");
});

test("mascot-switch implements styled-components 3D flip toggle effect with Astra and Astri labels", () => {
	const content = readFileSync(
		new URL("mascot-switch.tsx", import.meta.url),
		"utf8",
	);

	// Uses styled-components
	expect(content).toContain('import styled from "styled-components"');
	expect(content).toContain("tgl-flip");
	expect(content).toContain('data-tg-on="Astri"');
	expect(content).toContain('data-tg-off="Astra"');
	expect(content).toContain("rotateY");
});

test("mascot-stage renders Moodpress cloud silhouette, kawaii eyes, and omits sound toggle UI", () => {
	const content = readFileSync(
		new URL("mascot-stage.tsx", import.meta.url),
		"utf8",
	);

	// Expressive kawaii eyes and catchlights
	expect(content).toContain("isBlinking");
	expect(content).toContain("eyeOffset");

	// No audio toggle button in the UI (sound is default on)
	expect(content).not.toContain("Volume2");
	expect(content).not.toContain("VolumeX");
	expect(content).not.toContain("Aktifkan suara efek");
});
