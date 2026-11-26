"use client";

import { Toaster } from "@resora/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { usePathname } from "next/navigation";

import { queryClient } from "@/utils/trpc";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	const workspace =
		/^\/(dashboard-preview|dashboard|broadcasts|profile|attendance|scan|events|committees|admin)(\/|$)/.test(
			pathname,
		);
	return (
		<ThemeProvider
			key={workspace ? "workspace" : "public"}
			attribute="class"
			defaultTheme="light"
			storageKey={workspace ? "resora-workspace-theme" : "theme"}
			enableSystem={!workspace}
			disableTransitionOnChange
		>
			<QueryClientProvider client={queryClient}>
				{children}
				<ReactQueryDevtools />
			</QueryClientProvider>
			<Toaster richColors />
		</ThemeProvider>
	);
}
