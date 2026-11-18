/**
 * The persistence surface the views talk to. Two implementations: Notion
 * (`index.tsx`) and in-memory for `?mock` (`mock.ts`), so the mock runs every
 * real flow with no binding and nothing written anywhere.
 */

import type { Booking, Client, Job, Person, PlannedRound, Template } from "./model.ts"

export type SaveResult = { ok: true } | { ok: false; message: string }

/** The booking fields the editor owns. Written in full on every save. */
export type BookingDraft = Pick<Booking, "personId" | "placeholder" | "start" | "end" | "hoursPerDay" | "notes">

/** What the person panel edits. Stored on every one of the person's bookings. */
export type PersonProfile = Pick<Person, "roles" | "team" | "weeklyCapacity">

export type NewJob = {
	title: string
	number: string
	clientId: string | null
	templateId: string
	label: string | null
	/** Already planned by `planFromTemplate`; each becomes one Overflow booking. */
	rounds: PlannedRound[]
}

export type Store = {
	bookings: Booking[]
	jobs: Job[]
	clients: Client[]
	templates: Template[]
	people: Person[]
	/** The Role property's options, for the role filter. */
	roleOptions: string[]
	/** The Team property's options, for the person panel. */
	teamOptions: string[]
	/** The Label property's options, for New job. */
	labelOptions: string[]
	loading: boolean
	/** Configuration gaps, in words the person binding the block can act on. */
	bindingProblems: string[]

	saveBooking: (id: string, draft: BookingDraft) => Promise<SaveResult>
	deleteBooking: (id: string) => Promise<SaveResult>
	createJob: (job: NewJob) => Promise<SaveResult & { jobId?: string }>
	/** Writes Role, Team and Weekly capacity onto all of the person's bookings. */
	savePerson: (personId: string, profile: PersonProfile) => Promise<SaveResult>
}
