import { expect, test } from "bun:test";
import { QueryCache, QueryClient, QueryObserver } from "@tanstack/react-query";
import { refreshAttendanceQueries } from "./attendance-queries";

const keys = {
	all: [["attendance"]],
	preview: [["attendance", "preview"]],
	qr: [["attendance", "qr"]],
} as const;

for (const transition of ["publish", "close"] as const)
	test(`${transition} refreshes detail without refetching obsolete preview/QR`, async () => {
		let state = transition === "publish" ? "DRAFT" : "PUBLISHED";
		let errors = 0;
		let previewRequests = 0;
		let qrRequests = 0;
		const client = new QueryClient({
			queryCache: new QueryCache({ onError: () => errors++ }),
			defaultOptions: { queries: { retry: false } },
		});
		const options = [
			{
				queryKey: [
					["attendance", "detail"],
					{ input: { eventId: "synthetic" } },
				],
				queryFn: async () => state,
			},
			{
				queryKey: [...keys.preview, { input: { eventId: "synthetic" } }],
				queryFn: async () => {
					previewRequests++;
					if (state !== "DRAFT") throw new Error("DRAFT_ONLY");
					return state;
				},
			},
			{
				queryKey: [...keys.qr, { input: { eventId: "synthetic" } }],
				queryFn: async () => {
					qrRequests++;
					if (state === "CLOSED") throw new Error("SESSION_CLOSED");
					return state;
				},
			},
		];
		const stops = options.map((option) => {
			client.setQueryData(option.queryKey, state);
			return new QueryObserver<string>(client, {
				...option,
				staleTime: Number.POSITIVE_INFINITY,
			}).subscribe(() => {});
		});
		try {
			state = transition === "publish" ? "PUBLISHED" : "CLOSED";
			await refreshAttendanceQueries(client, keys);
			expect(client.getQueryData<string>(options[0].queryKey)).toBe(state);
			expect(previewRequests).toBe(0);
			expect(qrRequests).toBe(0);
			expect(errors).toBe(0);
			expect(client.getQueryState(options[1].queryKey)?.isInvalidated).toBe(
				true,
			);
		} finally {
			stops.forEach((stop) => {
				stop();
			});
			client.clear();
		}
	});

test("a failed background refresh preserves successful event data and is not a mutation rejection", async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const key = [["attendance", "detail"]];
	client.setQueryData(key, "PUBLISHED");
	const observer = new QueryObserver(client, {
		queryKey: key,
		staleTime: Number.POSITIVE_INFINITY,
		queryFn: async () => {
			throw new Error("synthetic offline refresh");
		},
	});
	const stop = observer.subscribe(() => {});
	try {
		await refreshAttendanceQueries(client, keys);
		expect(client.getQueryData<string>(key)).toBe("PUBLISHED");
		expect(client.getQueryState(key)?.status).toBe("error");
	} finally {
		stop();
		client.clear();
	}
});
