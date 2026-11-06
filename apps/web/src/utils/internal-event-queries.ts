import {
	partialMatchKey,
	type QueryClient,
	type QueryKey,
} from "@tanstack/react-query";

// Preview and QR depend on lifecycle state. Mark them stale, but let their
// enabled observers refetch only after the authoritative detail has updated.
export async function refreshAttendanceQueries(
	client: QueryClient,
	keys: { all: QueryKey; preview: QueryKey; qr: QueryKey },
) {
	await client.invalidateQueries({ queryKey: keys.all, refetchType: "none" });
	await client.refetchQueries({
		queryKey: keys.all,
		type: "active",
		predicate: (query) =>
			!partialMatchKey(query.queryKey, keys.preview) &&
			!partialMatchKey(query.queryKey, keys.qr),
	});
}
