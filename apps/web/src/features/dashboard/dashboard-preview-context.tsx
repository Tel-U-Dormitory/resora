"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import type { DashboardFixture, DashboardMode } from "./dashboard.contracts";

type DashboardPreviewValue = {
	fixture: DashboardFixture | null;
	previewMode: DashboardMode;
	setPreviewMode: (mode: DashboardMode) => void;
	canManage: boolean;
};

const DashboardPreviewContext = createContext<DashboardPreviewValue>({
	fixture: null,
	previewMode: "personal",
	setPreviewMode: () => {},
	canManage: false,
});

export function DashboardPreviewProvider({
	fixtures,
	canManage,
	initialMode,
	children,
}: {
	fixtures: Partial<Record<DashboardMode, DashboardFixture>> | null;
	canManage: boolean;
	initialMode: DashboardMode;
	children: ReactNode;
}) {
	const [previewMode, setPreviewMode] = useState<DashboardMode>(
		initialMode === "management" && !canManage ? "personal" : initialMode,
	);
	const selectMode = (mode: DashboardMode) => {
		if (mode === "personal" || canManage) setPreviewMode(mode);
	};
	const fixture = fixtures?.[previewMode] ?? null;

	return (
		<DashboardPreviewContext.Provider
			value={{ fixture, previewMode, setPreviewMode: selectMode, canManage }}
		>
			<div className="space-y-8">{children}</div>
		</DashboardPreviewContext.Provider>
	);
}

export function useDashboardPreview() {
	return useContext(DashboardPreviewContext);
}
