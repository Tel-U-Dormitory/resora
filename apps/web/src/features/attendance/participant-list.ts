// Visibility only: never truncate the invitation snapshot or CSV dataset.
export function participantPage<T extends { name: string; nim: string }>(
	participants: readonly T[],
	search: string,
	requestedPage: number,
) {
	const query = search.trim().toLowerCase();
	const matching = participants.filter((row) =>
		`${row.name} ${row.nim}`.toLowerCase().includes(query),
	);
	const pages = Math.max(1, Math.ceil(matching.length / 15));
	const page = Math.max(1, Math.min(requestedPage, pages));
	return {
		rows: matching.slice((page - 1) * 15, page * 15),
		page,
		pages,
		matching: matching.length,
	};
}
