import type { ReactNode } from "react";

type EmptyStateVariant = "folder" | "calendar" | "history" | "inbox";

function EmptyIllustration({ variant }: { variant: EmptyStateVariant }) {
	if (variant === "calendar") {
		return (
			<svg
				aria-hidden="true"
				viewBox="0 0 96 80"
				fill="none"
				className="mx-auto mb-3 h-16 w-20 shrink-0"
			>
				<rect
					x="16"
					y="16"
					width="64"
					height="52"
					rx="12"
					fill="var(--surface)"
					stroke="var(--border-control)"
					strokeWidth="2"
				/>
				<path
					d="M16 28a12 12 0 0 1 12-12h40a12 12 0 0 1 12 12v6H16v-6Z"
					fill="#FF6F6F"
				/>
				<rect x="30" y="10" width="6" height="12" rx="3" fill="#333333" />
				<rect x="60" y="10" width="6" height="12" rx="3" fill="#333333" />
				<rect x="28" y="42" width="10" height="8" rx="2.5" fill="#EBE9FE" />
				<rect x="43" y="42" width="10" height="8" rx="2.5" fill="#FFF46E" />
				<rect x="58" y="42" width="10" height="8" rx="2.5" fill="#EBE9FE" />
				<rect x="28" y="54" width="22" height="6" rx="3" fill="#E2E2E2" />
			</svg>
		);
	}

	if (variant === "history") {
		return (
			<svg
				aria-hidden="true"
				viewBox="0 0 96 80"
				fill="none"
				className="mx-auto mb-3 h-16 w-20 shrink-0"
			>
				<circle
					cx="48"
					cy="42"
					r="26"
					fill="#EBE9FE"
					stroke="#A58BFF"
					strokeWidth="2"
				/>
				<circle cx="48" cy="42" r="19" fill="var(--surface)" />
				<path
					d="M48 30v12l8 5"
					stroke="#5B4FE9"
					strokeWidth="3"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<circle cx="70" cy="24" r="9" fill="#FFF46E" />
				<path
					d="M66.5 24l2.5 2.5 4.5-4.5"
					stroke="#333333"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}

	if (variant === "inbox") {
		return (
			<svg
				aria-hidden="true"
				viewBox="0 0 96 80"
				fill="none"
				className="mx-auto mb-3 h-16 w-20 shrink-0"
			>
				<rect
					x="16"
					y="20"
					width="64"
					height="44"
					rx="12"
					fill="#EBE9FE"
					stroke="#A58BFF"
					strokeWidth="2"
				/>
				<path
					d="M18 26l30 20 30-20"
					stroke="#5B4FE9"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<circle cx="72" cy="22" r="9" fill="#FF6F6F" />
				<path
					d="M72 18v5m0 3h.01"
					stroke="#FFFFFF"
					strokeWidth="2.2"
					strokeLinecap="round"
				/>
			</svg>
		);
	}

	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 96 80"
			fill="none"
			className="mx-auto mb-3 h-16 w-20 shrink-0"
		>
			<circle cx="38" cy="32" r="11" fill="#A58BFF" />
			<path d="M20 62c0-9.9 8.1-18 18-18s18 8.1 18 18H20Z" fill="#EBE9FE" />
			<circle cx="62" cy="36" r="9" fill="#FFF46E" />
			<path d="M48 62c0-7.7 6.3-14 14-14s14 6.3 14 14H48Z" fill="#FF6F6F" />
		</svg>
	);
}

export function EmptyState({
	variant = "folder",
	title,
	description,
	action,
	compact = false,
}: {
	variant?: EmptyStateVariant;
	title: string;
	description?: string;
	action?: ReactNode;
	compact?: boolean;
}) {
	return (
		<div
			className={`flex flex-col items-center justify-center text-center ${compact ? "px-3 py-4" : "px-4 py-7 sm:py-9"}`}
		>
			<EmptyIllustration variant={variant} />
			<h3 className="font-bold text-foreground text-sm sm:text-base">
				{title}
			</h3>
			{description && (
				<p className="mt-1 max-w-xs text-muted-foreground text-xs leading-relaxed">
					{description}
				</p>
			)}
			{action && (
				<div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>
			)}
		</div>
	);
}
