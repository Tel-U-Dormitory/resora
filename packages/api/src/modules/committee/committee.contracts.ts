import type { committeePositionCodes } from "@resora/db/schema/committee";

export const committeePositionLabels: Record<
	(typeof committeePositionCodes)[number],
	string
> = {
	ANGGOTA: "Anggota",
	SEKDEP: "Sekdep",
	KADEP: "Kadep",
	SEKRE: "Sekre",
	BENDAHARA: "Bendahara",
	PIC1: "PIC 1",
	PIC2: "PIC 2",
	PJ: "PJ",
};
