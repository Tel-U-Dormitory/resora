"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ModeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	return (
		<Button
			variant="outline"
			size="icon"
			aria-label="Ganti tema terang atau gelap"
			onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
		>
			<Sun size={18} className="hidden dark:block" />
			<Moon size={18} className="dark:hidden" />
		</Button>
	);
}
