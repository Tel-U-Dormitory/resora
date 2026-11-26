"use client";

import {
	createContext,
	type ReactNode,
	useContext,
	useState,
	useSyncExternalStore,
} from "react";
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

function subscribeConnection(change: () => void) {
	window.addEventListener("online", change);
	window.addEventListener("offline", change);
	return () => {
		window.removeEventListener("online", change);
		window.removeEventListener("offline", change);
	};
}
const connectionSnapshot = () => navigator.onLine;
const serverConnectionSnapshot = () => true;

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
	const online = useSyncExternalStore(
		subscribeConnection,
		connectionSnapshot,
		serverConnectionSnapshot,
	);
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
			{!online && (
				<p
					role="status"
					className="rounded-xl border border-border bg-surface p-4 text-sm"
				>
					Kamu sedang offline. Informasi yang sudah dimuat bisa belum terbaru.
					Sambungkan internet untuk memperbarui.
				</p>
			)}
			<div className="resora-dashboard-layout">{children}</div>
		</DashboardPreviewContext.Provider>
	);
}

export function useDashboardPreview() {
	return useContext(DashboardPreviewContext);
}
