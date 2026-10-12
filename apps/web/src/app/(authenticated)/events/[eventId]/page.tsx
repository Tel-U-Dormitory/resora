import EventDetail from "@/features/attendance/event-detail";
export default async function EventPage({
	params,
}: {
	params: Promise<{ eventId: string }>;
}) {
	const { eventId } = await params;
	return <EventDetail eventId={eventId} />;
}
