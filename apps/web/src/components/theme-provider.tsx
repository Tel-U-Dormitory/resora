"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type * as React from "react";
import { useLayoutEffect } from "react";

function RestoreThemeBeforePaint() {
	const { resolvedTheme } = useTheme();
	useLayoutEffect(() => {
		if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
		// next-themes bootstraps SSR; a newly mounted route scope also needs
		// its saved preference before the first client-navigation paint.
		const root = document.documentElement;
		root.classList.remove("light", "dark");
		root.classList.add(resolvedTheme);
		root.style.colorScheme = resolvedTheme;
	}, [resolvedTheme]);
	return null;
}

export function ThemeProvider({
	children,
	...props
}: React.ComponentProps<typeof NextThemesProvider>) {
	return (
		<NextThemesProvider {...props}>
			<RestoreThemeBeforePaint />
			{children}
		</NextThemesProvider>
	);
}
