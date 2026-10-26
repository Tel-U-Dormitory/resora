import { notFound } from "next/navigation";
import CommitteeDetail from "@/features/committee/committee-detail";

export default async function CommitteePage({
	params,
}: {
	params: Promise<{ committeeId: string }>;
}) {
	const { committeeId } = await params;
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			committeeId,
		)
	)
		notFound();
	return <CommitteeDetail committeeId={committeeId} />;
}
