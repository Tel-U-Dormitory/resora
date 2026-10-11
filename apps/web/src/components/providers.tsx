"use client";

import { Toaster } from "@resora/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { queryClient } from "@/utils/trpc";
import { ThemeProvider } from "./theme-provider";
import { AuthProvider } from "@/features/auth/context/auth-context";
import { AttendanceStoreProvider } from "@/features/attendance/context/attendance-store";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AttendanceStoreProvider>
            {children}
          </AttendanceStoreProvider>
        </AuthProvider>
        <ReactQueryDevtools />
      </QueryClientProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
