import { EventList } from "@/features/events/public";
import { getSrSession } from "@/features/identity/server";
export default async function EventsPage() {
	const session = await getSrSession();
	return (
		<EventList canReadPoints={session?.canReadAttendancePoints ?? false} />
	);
}
