/**
 * All the arithmetic for the program summary block. Pure: no React, no SDK,
 * so test/aggregate.test.ts can exercise it against the real snapshot.
 */

export type ProgramRow = { id: string; name: string }

export type RewardRow = {
	id: string
	name: string
	programIds: string[]
	payoutIds: string[]
	amount: number | null // dollars
	status: string // hold | pending | approved | declined | paid | ""
	paymentDate: string | null // YYYY-MM-DD
	created: string | null // YYYY-MM-DD
}

export type PayoutRow = {
	id: string
	name: string
	amount: number | null
	status: string
	fee: number | null
	date: string | null // withdrawn, else sent, else created
}

export type Bucket = { amount: number; count: number }
export type Totals = {
	paid: Bucket
	approved: Bucket
	pending: Bucket
	hold: Bucket
	declined: Bucket
	rewards: number
	/** Earliest payment date among rewards not yet paid or declined. */
	nextPaymentDate: string | null
	lastPaidDate: string | null
}

export type Month = { month: string; paid: number; scheduled: number }

export type PayoutLine = {
	payout: PayoutRow
	/** This program's rewards in the payout, in dollars (before the withdrawal fee). */
	share: number
	rewardCount: number
	programNames: string[]
}

export type ProgramLine = { program: ProgramRow; totals: Totals }

export type Summary = {
	/** The program this page belongs to, or null for the all-programs overview. */
	program: ProgramRow | null
	totals: Totals
	months: Month[]
	payouts: PayoutLine[]
	rewards: RewardRow[]
	/** Overview only: one line per program, largest paid first. */
	programs: ProgramLine[]
}

/** Notion ids arrive with and without dashes depending on the surface. */
export const normId = (id: string) => id.replace(/-/g, "").toLowerCase()

const UNPAID = new Set(["approved", "pending", "hold"])

function emptyTotals(): Totals {
	const b = () => ({ amount: 0, count: 0 })
	return {
		paid: b(),
		approved: b(),
		pending: b(),
		hold: b(),
		declined: b(),
		rewards: 0,
		nextPaymentDate: null,
		lastPaidDate: null,
	}
}

export function totalsOf(rewards: RewardRow[]): Totals {
	const t = emptyTotals()
	for (const r of rewards) {
		t.rewards++
		const amount = r.amount ?? 0
		const bucket =
			r.status === "paid" || r.status === "approved" || r.status === "pending" ||
			r.status === "hold" || r.status === "declined"
				? t[r.status]
				: null
		if (bucket) {
			bucket.amount += amount
			bucket.count++
		}
		if (UNPAID.has(r.status) && r.paymentDate) {
			if (!t.nextPaymentDate || r.paymentDate < t.nextPaymentDate) t.nextPaymentDate = r.paymentDate
		}
		if (r.status === "paid" && r.paymentDate) {
			if (!t.lastPaidDate || r.paymentDate > t.lastPaidDate) t.lastPaidDate = r.paymentDate
		}
	}
	// Float sums of cents-derived dollars: round to cents once, at the end.
	for (const k of ["paid", "approved", "pending", "hold", "declined"] as const) {
		t[k].amount = Math.round(t[k].amount * 100) / 100
	}
	return t
}

const addMonth = (m: string) => {
	const [y, mo] = m.split("-").map(Number)
	return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`
}

/**
 * Money by payment month: paid, and scheduled (approved/pending/hold with a
 * payment date). Declined rewards and $0 rows contribute nothing. Months
 * between the first and last are filled in, so a gap reads as a gap.
 */
export function monthsOf(rewards: RewardRow[]): Month[] {
	const by = new Map<string, Month>()
	for (const r of rewards) {
		const amount = r.amount ?? 0
		if (!r.paymentDate || amount === 0) continue
		const kind = r.status === "paid" ? "paid" : UNPAID.has(r.status) ? "scheduled" : null
		if (!kind) continue
		const month = r.paymentDate.slice(0, 7)
		const m = by.get(month) ?? { month, paid: 0, scheduled: 0 }
		m[kind] += amount
		by.set(month, m)
	}
	const keys = [...by.keys()].sort()
	if (!keys.length) return []
	const out: Month[] = []
	for (let m = keys[0]; m <= keys.at(-1)!; m = addMonth(m)) {
		const v = by.get(m) ?? { month: m, paid: 0, scheduled: 0 }
		out.push({ ...v, paid: round(v.paid), scheduled: round(v.scheduled) })
	}
	return out
}

const round = (n: number) => Math.round(n * 100) / 100

export function summarize(
	programs: ProgramRow[],
	rewards: RewardRow[],
	payouts: PayoutRow[],
	pageId: string | null,
): Summary {
	const programById = new Map(programs.map((p) => [normId(p.id), p]))
	const program = pageId ? (programById.get(normId(pageId)) ?? null) : null

	const mine = program
		? rewards.filter((r) => r.programIds.some((id) => normId(id) === normId(program.id)))
		: rewards

	// Payout → its rewards, read from the reward side (one id per reward), so the
	// 25-id cap on a relation's many side never matters.
	const linesById = new Map<string, PayoutLine>()
	const payoutById = new Map(payouts.map((p) => [normId(p.id), p]))
	for (const r of mine) {
		for (const pid of r.payoutIds) {
			const payout = payoutById.get(normId(pid))
			if (!payout) continue
			const line = linesById.get(normId(pid)) ?? { payout, share: 0, rewardCount: 0, programNames: [] }
			line.share += r.amount ?? 0
			line.rewardCount++
			if ((r.amount ?? 0) > 0) {
				for (const progId of r.programIds) {
					const name = programById.get(normId(progId))?.name
					if (name && !line.programNames.includes(name)) line.programNames.push(name)
				}
			}
			linesById.set(normId(pid), line)
		}
	}
	// The overview also lists payouts no reward points at (e.g. an unmatched one).
	if (!program) {
		for (const p of payouts) {
			if (!linesById.has(normId(p.id))) {
				linesById.set(normId(p.id), { payout: p, share: 0, rewardCount: 0, programNames: [] })
			}
		}
	}
	const payoutLines = [...linesById.values()]
		.map((l) => ({ ...l, share: round(l.share) }))
		.filter((l) => !program || l.share > 0)
		.sort((a, b) => (b.payout.date ?? "").localeCompare(a.payout.date ?? ""))

	const programLines = program
		? []
		: programs
				.map((p) => ({
					program: p,
					totals: totalsOf(rewards.filter((r) => r.programIds.some((id) => normId(id) === normId(p.id)))),
				}))
				.sort((a, b) => b.totals.paid.amount - a.totals.paid.amount || a.program.name.localeCompare(b.program.name))

	return {
		program,
		totals: totalsOf(mine),
		months: monthsOf(mine),
		payouts: payoutLines,
		rewards: [...mine].sort((a, b) => (b.created ?? "").localeCompare(a.created ?? "")),
		programs: programLines,
	}
}
