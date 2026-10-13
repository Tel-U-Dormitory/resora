"use client";

import { Button } from "@resora/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@resora/ui/components/dropdown-menu";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ModeToggle() {
	const { setTheme } = useTheme();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" size="icon" />}>
				<Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
				<Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
				<span className="sr-only">Ganti tema</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => setTheme("light")}>
					Terang
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("dark")}>
					Gelap
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("system")}>
					Ikuti sistem
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
