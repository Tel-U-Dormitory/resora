import type { AppRouter } from "@resora/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";
import { queryErrorMessage } from "./request-error";
import { getServerUrl } from "./server-url";

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error, query) => {
			if (query.meta?.errorHandledLocally === true) return;
			toast.error(queryErrorMessage(error), {
				action: {
					label: "Coba kembali",
					onClick: () => {
						query.invalidate();
					},
				},
			});
		},
	}),
});

const trpcClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${getServerUrl(process.env.NEXT_PUBLIC_SERVER_URL)}/trpc`,
			fetch(url, options) {
				return fetch(url, {
					...options,
					credentials: "include",
				});
			},
		}),
	],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
	client: trpcClient,
	queryClient,
});

export const attendanceQueryKeys = {
	all: trpc.attendance.pathKey(),
	preview: trpc.attendance.preview.pathKey(),
	qr: trpc.attendance.qr.pathKey(),
};
