"use client";

import { Button } from "@resora/ui/components/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ModeToggle({
	allowSystem: _allowSystem = true,
}: {
	allowSystem?: boolean;
}) {
	const { resolvedTheme, setTheme } = useTheme();

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			aria-label="Ganti tema"
			title="Ganti tema"
			onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
			className="relative size-10 rounded-full border border-border bg-surface"
		>
			<Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
			<Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
			<span className="sr-only">Ganti tema</span>
		</Button>
	);
}
