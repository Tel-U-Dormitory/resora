export const committeePositionLabels = {
	ANGGOTA: "Anggota",
	SEKDEP: "Sekdep",
	KADEP: "Kadep",
	SEKRE: "Sekre",
	BENDAHARA: "Bendahara",
	PIC1: "PIC 1",
	PIC2: "PIC 2",
	PJ: "PJ",
} as const;

export type CommitteePosition = keyof typeof committeePositionLabels;
