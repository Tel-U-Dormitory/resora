import { TRPCError } from "@trpc/server";

export function requirePilotProfile<
	T extends { actor: string; isActive: boolean },
>(profile: T | undefined): T {
	if (!profile?.isActive || profile.actor !== "SR") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Akun SR aktif diperlukan. Hubungi pengelola akun RESORA.",
		});
	}
	return profile;
}

export function getAttendancePermissions(profile: {
	actor: string;
	isActive: boolean;
	departmentCode: string;
	positionCode: string;
}) {
	const isHCO =
		profile.isActive &&
		profile.actor === "SR" &&
		profile.departmentCode === "HCO";
	const isKadivHCO = isHCO && profile.positionCode === "KADIV";
	return {
		isHCO,
		isKadivHCO,
		canCreateEvent: isHCO,
		canManageQR: isHCO,
		canCloseEvent: isHCO,
		canManualEntry: isKadivHCO,
		canExportReport: isHCO,
	};
}
