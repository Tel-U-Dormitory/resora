import { EventDetail } from "@/features/events/public";
export default async function EventPage({
	params,
}: {
	params: Promise<{ eventId: string }>;
}) {
	const { eventId } = await params;
	return <EventDetail eventId={eventId} />;
}
