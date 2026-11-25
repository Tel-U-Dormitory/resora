"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import type { DashboardFixture, DashboardMode } from "./dashboard.contracts";

type DashboardPreviewValue = {
	fixture: DashboardFixture | null;
	previewMode: DashboardMode;
	setPreviewMode: (mode: DashboardMode) => void;
};

const DashboardPreviewContext = createContext<DashboardPreviewValue>({
	fixture: null,
	previewMode: "personal",
	setPreviewMode: () => {},
});

export function DashboardPreviewProvider({
	fixtures,
	children,
}: {
	fixtures: Record<DashboardMode, DashboardFixture> | null;
	children: ReactNode;
}) {
	const [previewMode, setPreviewMode] = useState<DashboardMode>("personal");
	const fixture = fixtures?.[previewMode] ?? null;

	return (
		<DashboardPreviewContext.Provider
			value={{ fixture, previewMode, setPreviewMode }}
		>
			<div className="space-y-8">{children}</div>
		</DashboardPreviewContext.Provider>
	);
}

export function useDashboardPreview() {
	return useContext(DashboardPreviewContext);
}
