/// <reference types="bun" />

import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupTextarea,
} from "./input-group";
import { Label } from "./label";

test("input grouping is native and labels retain their control association", () => {
	const markup = renderToStaticMarkup(
		<InputGroup aria-label="Account identity">
			<Label htmlFor="synthetic-nim">NIM</Label>
			<InputGroupInput id="synthetic-nim" />
		</InputGroup>,
	);
	expect(markup).toContain("<fieldset");
	expect(markup).toContain('aria-label="Account identity"');
	expect(markup).toContain('for="synthetic-nim"');
	expect(markup).toContain('id="synthetic-nim"');
	expect(markup).toContain(">NIM</label>");
});

test("addon labels automatically target an input's existing id", () => {
	const markup = renderToStaticMarkup(
		<InputGroup>
			<InputGroupAddon>NIM</InputGroupAddon>
			<InputGroupInput id="synthetic-nim" />
		</InputGroup>,
	);
	expect(markup).toContain('for="synthetic-nim"');
	expect(markup).not.toContain("tabindex=");
	expect(markup).not.toContain('role="button"');
});

test("controls without an id get a matching native label association", () => {
	for (const control of [
		<InputGroupInput key="input" />,
		<InputGroupTextarea key="textarea" />,
	]) {
		const markup = renderToStaticMarkup(
			<InputGroup>
				<InputGroupAddon>Identity</InputGroupAddon>
				{control}
			</InputGroup>,
		);
		const id = markup.match(/for="([^"]+)"/)?.[1];
		expect(id).toBeTruthy();
		expect(markup).toContain(`id="${id}"`);
	}
});

test("native controls keep keyboard handling and addons add no synthetic handlers", () => {
	const addon = InputGroupAddon({ children: "Prefix" });
	expect(addon.type).toBe("label");
	expect(addon.props.onClick).toBeUndefined();
	expect(addon.props.onKeyDown).toBeUndefined();
	expect(addon.props.tabIndex).toBeUndefined();
});

test("explicit label targets, nested buttons and consumer handlers are preserved", () => {
	const onClick = mock(() => {});
	const onKeyDown = mock(() => {});
	const button = <button type="button">Action</button>;
	const addon = InputGroupAddon({
		children: button,
		htmlFor: "another-control",
		onClick,
		onKeyDown,
	});
	expect(addon.props.onClick).toBe(onClick);
	expect(addon.props.onKeyDown).toBe(onKeyDown);
	expect(addon.props.children).toBe(button);
	const markup = renderToStaticMarkup(
		<InputGroup>
			<InputGroupAddon htmlFor="another-control">Prefix</InputGroupAddon>
			<InputGroupInput id="synthetic-nim" />
		</InputGroup>,
	);
	expect(markup).toContain('for="another-control"');
});

test("a group without controls renders safely", () => {
	expect(() =>
		renderToStaticMarkup(
			<InputGroup>
				<InputGroupAddon>Prefix</InputGroupAddon>
			</InputGroup>,
		),
	).not.toThrow();
});
