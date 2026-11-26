import { notFound } from "next/navigation";
import { ModeToggle } from "@/components/mode-toggle";
import { ViolationsWorkspace } from "@/features/violations/workspace";

export default function ViolationsPreviewPage() {
	if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test")
		notFound();

	return (
		<div className="resora-workspace min-h-dvh">
			<header className="border-border border-b bg-surface">
				<div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-3 md:px-6 xl:px-8">
					<span className="font-bold tracking-tight">RESORA</span>
					<ModeToggle />
				</div>
			</header>
			<main>
				<ViolationsWorkspace />
			</main>
		</div>
	);
}
