import {
	load,
	patchGlobalConsole,
	patchGlobalResponse,
	patchGlobalServerResponse,
} from "varlock";

// Use the supported in-process loader: Functions need no CLI subprocess/shim.
await load();
patchGlobalConsole();
patchGlobalServerResponse();
patchGlobalResponse();

export { ENV } from "./env";
