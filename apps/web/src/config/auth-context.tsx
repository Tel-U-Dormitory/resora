"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";
import type { UserProfile, UserRolePermissions } from "./auth-types";

interface AuthContextValue {
	user: UserProfile | null;
	permissions: UserRolePermissions | null;
	isLoading: boolean;
	error: string | null;
	isUnauthenticated: boolean;
	retry: () => void;
	logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const session = authClient.useSession();
	const profile = useQuery(
		trpc.identity.me.queryOptions(undefined, {
			enabled: !!session.data?.session,
			retry: false,
			staleTime: 0,
			refetchOnWindowFocus: true,
		}),
	);
	const validProfile =
		!session.error &&
		!profile.isError &&
		profile.data?.user.id === session.data?.user.id
			? profile.data
			: null;

	async function logout() {
		const result = await authClient.signOut();
		if (result.error) throw new Error("Gagal keluar. Silakan coba lagi.");
		queryClient.clear();
		window.location.replace("/login");
	}

	return (
		<AuthContext.Provider
			value={{
				user: validProfile?.user ?? null,
				permissions: validProfile?.permissions ?? null,
				isLoading: session.isPending || (!!session.data && profile.isPending),
				error: session.error
					? "Tidak dapat memeriksa sesi. Silakan coba lagi."
					: (profile.error?.message ?? null),
				isUnauthenticated:
					!session.isPending &&
					!session.error &&
					(!session.data || profile.error?.data?.code === "UNAUTHORIZED"),
				retry: () => {
					void session.refetch();
					void profile.refetch();
				},
				logout,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) throw new Error("useAuth must be used within an AuthProvider");
	return context;
}
