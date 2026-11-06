"use client";
import type { AppRouter } from "@resora/api/routers/index";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterInputs } from "@trpc/server";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { trpc } from "@/utils/trpc";
import { toWibDateTimeInput } from "../../../components/event-feedback";

import { participantPage } from "../../../utils/participant-page";

import { DORM_HALL, type LocationPoint } from "../event-location-picker";
import { isInvited, type RosterCandidate } from "../roster-selection";
export const fieldClass =
	"aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";
export const timeRangeMessage =
	"Waktu selesai harus lebih lambat dari waktu mulai.";
export type Draft = inferRouterInputs<AppRouter>["attendance"]["create"];
export const departments = [
	"INTI",
	"ADAPTIF",
	"SOSIAL",
	"AKADEMIK",
	"SPIRITUAL",
	"HCO",
	"MEDIA",
	"RND",
] as const;
export const empty: Draft = {
	title: "",
	description: "",
	startsAt: "",
	endsAt: "",
	session: {
		...DORM_HALL,
		geofenceRadiusM: 20,
		lateGraceMinutes: 15,
		qrTtlMinutes: 360,
	},
	rosterCriteria: {
		allSr: false,
		departments: [],
		inti: false,
		kadep: false,
		individuals: [],
		include: [],
		exclude: [],
	},
};
export type DraftEditorProps = {
	initial: Draft;
	advancedMode?: "FULL" | "LIMITED" | "METADATA";
	eventId?: string;
	candidates: RosterCandidate[];
	invalidCount: number;
	initialCommitteeName: string;
	frozenParticipants?: RosterCandidate[];
};
export function useDraftEditor(props: DraftEditorProps) {
	const {
		initial,
		advancedMode,
		eventId,
		candidates,
		invalidCount,
		initialCommitteeName,
		frozenParticipants,
	} = props;
	const [draft, setDraft] = useState(initial);
	const [committeeSearch, setCommitteeSearch] = useState("");
	const [committeePage, setCommitteePage] = useState(0);
	const committeeMode = draft.organizationContext === "COMMITTEE";
	const frozenCommittee = committeeMode && Boolean(advancedMode);
	const committees = useQuery({
		...trpc.committee.list.queryOptions({
			search: committeeSearch,
			limit: 20,
			offset: committeePage * 20,
		}),
		enabled: committeeMode && !frozenCommittee,
		meta: { errorHandledLocally: true },
	});
	const committee = useQuery({
		...trpc.committee.detail.queryOptions({
			committeeId: draft.committeeId ?? "00000000-0000-4000-8000-000000000000",
		}),
		enabled: committeeMode && !frozenCommittee && Boolean(draft.committeeId),
		meta: { errorHandledLocally: true },
	});
	const submitLock = useRef(false);
	const setLocation = useCallback((point: LocationPoint) => {
		if (submitLock.current) return;
		setDraft((current) => ({
			...current,
			session: { ...current.session, ...point },
		}));
	}, []);
	const [start, setStart] = useState(
		initial.startsAt ? toWibDateTimeInput(initial.startsAt) : "",
	);
	const [end, setEnd] = useState(
		initial.endsAt ? toWibDateTimeInput(initial.endsAt) : "",
	);
	const [error, setError] = useState("");
	const [reason, setReason] = useState("");
	const fullEditing = !advancedMode || advancedMode === "FULL";
	const editorTitle = advancedMode
		? "Edit event"
		: eventId
			? "Edit draft"
			: "Buat event";
	const [endError, setEndError] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [saving, setSaving] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);
	const errorRef = useRef<HTMLDivElement>(null);
	const [invalidFieldId, setInvalidFieldId] = useState("");
	useEffect(() => {
		if (error || endError) errorRef.current?.focus();
	}, [error, endError]);
	const router = useRouter();
	const create = useMutation(trpc.attendance.create.mutationOptions());
	const edit = useMutation(trpc.attendance.editDraft.mutationOptions());
	const advanced = useMutation(trpc.attendance.advancedEdit.mutationOptions());
	const criteria = draft.rosterCriteria ?? empty.rosterCriteria;
	const session = draft.session;
	if (!criteria) return null;
	const assignments = new Map(
		committee.data?.members
			.filter((member) => member.eligible)
			.map((member) => [member.userId, member]),
	);
	const defaultIds = committeeMode
		? new Set(
				frozenCommittee
					? frozenParticipants?.map((sr) => sr.userId)
					: [...assignments.keys()],
			)
		: undefined;
	const available = frozenCommittee
		? [
				...new Map(
					[...candidates, ...(frozenParticipants ?? [])].map((sr) => [
						sr.userId,
						sr,
					]),
				).values(),
			]
		: candidates.map((sr) => ({
				...sr,
				committeeDivision:
					committee.data?.divisions.find(
						(division) =>
							division.id === assignments.get(sr.userId)?.divisionId,
					)?.name ?? null,
				committeePosition: assignments.get(sr.userId)?.positionCode ?? null,
			}));
	const candidatePage = participantPage(available, search, page);
	const invitedCount = new Set(
		available
			.filter((sr) => isInvited(sr, criteria, defaultIds))
			.map((sr) => sr.userId),
	).size;
	return {
		initial,
		advancedMode,
		eventId,
		candidates,
		invalidCount,
		initialCommitteeName,
		frozenParticipants,
		draft,
		setDraft,
		committeeSearch,
		setCommitteeSearch,
		committeePage,
		setCommitteePage,
		committeeMode,
		frozenCommittee,
		committees,
		committee,
		submitLock,
		setLocation,
		start,
		setStart,
		end,
		setEnd,
		error,
		setError,
		reason,
		setReason,
		fullEditing,
		editorTitle,
		endError,
		setEndError,
		search,
		setSearch,
		page,
		setPage,
		saving,
		setSaving,
		formRef,
		errorRef,
		invalidFieldId,
		setInvalidFieldId,
		router,
		create,
		edit,
		advanced,
		criteria,
		session,
		assignments,
		defaultIds,
		available,
		candidatePage,
		invitedCount,
	};
}
export type DraftEditorView = NonNullable<ReturnType<typeof useDraftEditor>>;
