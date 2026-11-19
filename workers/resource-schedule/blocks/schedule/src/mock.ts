/**
 * `?mock`: the same Store over the fixture, held in memory. Every flow the
 * Notion store has runs here too, which is how layout work and demo rehearsal
 * happen without a binding, a deploy or a single write.
 */

import { useMemo, useState } from "react"

import { fixture } from "./fixture.ts"
import { mondayOf, sortPeople, todayIso, type Booking, type Job, type Person } from "./model.ts"
import type { Store } from "./store.ts"

const ROLE_OPTIONS = ["Designer", "Retoucher", "Editor", "Motion Designer", "Copywriter", "Producer", "Account Manager"]
const TEAM_OPTIONS = ["Studio", "Agency"]
const LABEL_OPTIONS = ["Blue", "Green", "Orange", "Pink", "Purple", "Yellow", "Red", "Brown"]

const pause = () => new Promise((r) => setTimeout(r, 250))

export function useMockStore(): Store {
	const seed = useMemo(() => fixture(mondayOf(todayIso())), [])
	const [bookings, setBookings] = useState<Booking[]>(seed.bookings)
	const [jobs, setJobs] = useState<Job[]>(seed.jobs)
	const [team, setTeam] = useState<Person[]>(seed.people)

	return useMemo<Store>(() => {
		const people = sortPeople(team)
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
						return { ...b, ...d, placeholder: d.personId ? null : (d.placeholder ?? "Overflow") }
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
						notes: null,
					})),
				])
				return { ok: true, jobId }
			},

			async savePerson(personId, profile) {
				await pause()
				setTeam((all) => all.map((p) => (p.id === personId ? { ...p, ...profile } : p)))
				return { ok: true }
			},
		}
	}, [bookings, jobs, team, seed])
}
