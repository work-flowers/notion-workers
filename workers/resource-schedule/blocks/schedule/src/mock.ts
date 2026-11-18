/**
 * `?mock`: the same Store over the fixture, held in memory. Every flow the
 * Notion store has runs here too, which is how layout work and demo rehearsal
 * happen without a binding, a deploy or a single write.
 */

import { useMemo, useState } from "react"

import { fixture, PEOPLE } from "./fixture.ts"
import { deriveRoster, mondayOf, todayIso, type Booking, type Job } from "./model.ts"
import type { Store } from "./store.ts"

const ROLE_OPTIONS = ["Designer", "Retoucher", "Editor", "Motion Designer", "Copywriter", "Producer", "Account Manager"]
const TEAM_OPTIONS = ["Studio", "Agency"]
const LABEL_OPTIONS = ["Blue", "Green", "Orange", "Pink", "Purple", "Yellow", "Red", "Brown"]

const pause = () => new Promise((r) => setTimeout(r, 250))

export function useMockStore(): Store {
	const seed = useMemo(() => fixture(mondayOf(todayIso())), [])
	const [bookings, setBookings] = useState<Booking[]>(seed.bookings)
	const [jobs, setJobs] = useState<Job[]>(seed.jobs)

	return useMemo<Store>(() => {
		const people = deriveRoster(bookings, seed.names, seed.clients, PEOPLE.map((p) => p.id))
		return {
			bookings,
			jobs,
			clients: seed.clients,
			templates: seed.templates,
			people,
			roleOptions: ROLE_OPTIONS,
			teamOptions: TEAM_OPTIONS,
			labelOptions: LABEL_OPTIONS,
			loading: false,
			bindingProblems: [],

			async saveBooking(id, d) {
				await pause()
				setBookings((all) =>
					all.map((b) => {
						if (b.id !== id) return b
						// Same as the Notion store: Role, Team and capacity come from the roster.
						const who = d.personId ? people.find((p) => p.id === d.personId) : undefined
						return {
							...b,
							...d,
							placeholder: d.personId ? null : (d.placeholder ?? "Overflow"),
							roles: who?.roles ?? [],
							team: who?.team ?? null,
							capacity: who?.weeklyCapacity ?? null,
						}
					}),
				)
				return { ok: true }
			},

			async deleteBooking(id) {
				await pause()
				setBookings((all) => all.filter((b) => b.id !== id))
				return { ok: true }
			},

			async createJob(j) {
				await pause()
				const jobId = `j-new-${Date.now()}`
				setJobs((all) => [
					...all,
					{ id: jobId, title: j.title, number: j.number || null, clientId: j.clientId, templateId: j.templateId, label: j.label },
				])
				setBookings((all) => [
					...all,
					...j.rounds.map((r) => ({
						id: `${jobId}-r${r.round}`,
						title: `${j.title} · R${r.round}`,
						jobId,
						personId: null,
						placeholder: "Overflow",
						start: r.start,
						end: r.end,
						hoursPerDay: r.hoursPerDay,
						round: r.round,
						roles: [],
						team: null,
						capacity: null,
						notes: null,
					})),
				])
				return { ok: true, jobId }
			},

			async savePerson(personId, profile) {
				await pause()
				setBookings((all) =>
					all.map((b) =>
						b.personId === personId ? { ...b, roles: profile.roles, team: profile.team, capacity: profile.weeklyCapacity } : b,
					),
				)
				return { ok: true }
			},
		}
	}, [bookings, jobs, seed])
}
