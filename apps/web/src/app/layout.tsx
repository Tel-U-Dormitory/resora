import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";

import "../index.css";
import Providers from "@/components/providers";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});
const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});
const jakartaSans = localFont({
	src: "../styles/fonts/PlusJakartaSans.ttf",
	variable: "--font-plus-jakarta-sans",
	weight: "400 700",
	display: "swap",
	preload: false,
});

export const metadata: Metadata = {
	title: "RESORA | Platform Senior Resident Telkom University",
	description:
		"Platform internal Senior Resident Telkom University untuk mengelola kegiatan, undangan event, absensi QR, dan riwayat kehadiran.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="id" className={jakartaSans.variable} suppressHydrationWarning>
			<body
				className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
			>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
