import type { Metadata } from "next";
import SrProfile from "@/features/identity/sr-profile";

export const metadata: Metadata = { title: "Profil Saya | RESORA" };

export default function ProfilePage() {
	return <SrProfile />;
}
