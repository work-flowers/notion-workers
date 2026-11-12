import { useState } from "react"

import type { Month, PayoutLine, RewardRow, Summary, Totals } from "./aggregate.ts"

export type AppProps =
	| { status: "loading" }
	| { status: "error"; message?: string }
	| { status: "unbound"; missing: string[] }
	| { status: "ready"; summary: Summary; truncated: boolean }

export function App(props: AppProps) {
	if (props.status === "loading") return <p className="ps-note">Loading PartnerStack data…</p>
	if (props.status === "error")
		return <p className="ps-note ps-error">Couldn't load PartnerStack data{props.message ? `: ${props.message}` : "."}</p>
	if (props.status === "unbound")
		return (
			<div className="ps-note">
				<strong>Finish setting up this block.</strong> Map these in the block's settings:{" "}
				{props.missing.join(", ")}.
			</div>
		)
	const { summary, truncated } = props
	return (
		<div className="ps-dash">
			<Tiles totals={summary.totals} />
			{summary.program && summary.totals.rewards === 0 ? (
				<p className="ps-note">No rewards in this program yet.</p>
			) : (
				<>
					<Section title="By payment month">
						<MonthlyBars months={summary.months} />
					</Section>
					{summary.program ? null : <ProgramsTable summary={summary} />}
					<Section title={summary.program ? "Payouts including this program" : "Payouts"}>
						<PayoutsTable lines={summary.payouts} perProgram={Boolean(summary.program)} />
					</Section>
					<Section title="Rewards">
						<RewardsTable rewards={summary.rewards} showProgram={!summary.program} names={programNames(summary)} />
					</Section>
				</>
			)}
			{truncated ? (
				<p className="ps-footnote">Only the first 999 rows of a data source are read, so totals may be incomplete.</p>
			) : null}
		</div>
	)
}

function programNames(s: Summary): Map<string, string> {
	return new Map(s.programs.map((l) => [l.program.id, l.program.name]))
}

// ── formatting ────────────────────────────────────────────────────────────

const usd = (n: number) =>
	n.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
		maximumFractionDigits: 2,
	})

const fmtDay = (d: string | null) =>
	d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"

const fmtMonth = (m: string) =>
	new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`

// ── pieces ────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="ps-section">
			<h3 className="ps-h">{title}</h3>
			{children}
		</section>
	)
}

function Tiles({ totals }: { totals: Totals }) {
	const awaiting = totals.approved.amount + totals.pending.amount + totals.hold.amount
	const awaitingCount = totals.approved.count + totals.pending.count + totals.hold.count
	return (
		<div className="ps-tiles">
			<Tile label="Paid" value={usd(totals.paid.amount)} sub={totals.lastPaidDate ? `last ${fmtDay(totals.lastPaidDate)}` : plural(totals.paid.count, "reward")} tone="paid" />
			<Tile
				label="Awaiting payment"
				value={usd(awaiting)}
				sub={
					awaitingCount
						? `${totals.approved.count} approved · ${totals.pending.count + totals.hold.count} pending${totals.nextPaymentDate ? ` · next ${fmtDay(totals.nextPaymentDate)}` : ""}`
						: "nothing outstanding"
				}
				tone="scheduled"
			/>
			<Tile label="Declined" value={usd(totals.declined.amount)} sub={plural(totals.declined.count, "reward")} tone="declined" />
			<Tile label="Rewards" value={String(totals.rewards)} sub="all statuses, incl. $0 events" />
		</div>
	)
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
	return (
		<div className="ps-tile" data-tone={tone}>
			<div className="ps-tile-label">{label}</div>
			<div className="ps-tile-value">{value}</div>
			<div className="ps-tile-sub">{sub}</div>
		</div>
	)
}

function MonthlyBars({ months }: { months: Month[] }) {
	if (!months.length) return <p className="ps-note">No paid or scheduled amounts yet.</p>
	const max = Math.max(...months.map((m) => m.paid + m.scheduled), 1)
	const H = 120
	return (
		<div className="ps-chart">
			<div className="ps-legend">
				<span><i data-kind="paid" /> Paid</span>
				<span><i data-kind="scheduled" /> Scheduled</span>
			</div>
			<div className="ps-bars" role="img" aria-label="Paid and scheduled amounts by payment month">
				{months.map((m) => {
					return (
						<div
							className="ps-bar-col"
							key={m.month}
							tabIndex={0}
							aria-label={`${fmtMonth(m.month)}: ${usd(m.paid)} paid, ${usd(m.scheduled)} scheduled`}
						>
							<div className="ps-tooltip" role="tooltip">
								<div className="ps-tooltip-title">{fmtMonth(m.month)}</div>
								{m.paid || !m.scheduled ? (
									<div><i data-kind="paid" /> Paid <span>{usd(m.paid)}</span></div>
								) : null}
								{m.scheduled ? (
									<div><i data-kind="scheduled" /> Scheduled <span>{usd(m.scheduled)}</span></div>
								) : null}
							</div>
							<div className="ps-bar-stack" style={{ height: H }}>
								<div className="ps-bar" data-kind="scheduled" style={{ height: (m.scheduled / max) * H }} />
								<div className="ps-bar" data-kind="paid" style={{ height: (m.paid / max) * H }} />
							</div>
							<div className="ps-bar-label">{fmtMonth(m.month)}</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}

function ProgramsTable({ summary }: { summary: Summary }) {
	return (
		<Section title="By program">
			<div className="ps-table-wrap">
				<table className="ps-table">
					<thead>
						<tr>
							<th>Program</th>
							<th className="num">Rewards</th>
							<th className="num">Paid</th>
							<th className="num">Awaiting</th>
							<th className="num">Declined</th>
						</tr>
					</thead>
					<tbody>
						{summary.programs.map(({ program, totals }) => (
							<tr key={program.id}>
								<td>{program.name}</td>
								<td className="num">{totals.rewards}</td>
								<td className="num">{usd(totals.paid.amount)}</td>
								<td className="num">{usd(totals.approved.amount + totals.pending.amount + totals.hold.amount)}</td>
								<td className="num">{usd(totals.declined.amount)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Section>
	)
}

function PayoutsTable({ lines, perProgram }: { lines: PayoutLine[]; perProgram: boolean }) {
	if (!lines.length) return <p className="ps-note">No payouts yet.</p>
	return (
		<div className="ps-table-wrap">
			<table className="ps-table">
				<thead>
					<tr>
						<th>Date</th>
						<th className="num">Payout</th>
						<th className="num">{perProgram ? "From this program" : "Fee"}</th>
						{perProgram ? null : <th>Programs</th>}
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{lines.map((l) => (
						<tr key={l.payout.id}>
							<td>{fmtDay(l.payout.date)}</td>
							<td className="num">{l.payout.amount == null ? "—" : usd(l.payout.amount)}</td>
							<td className="num">
								{perProgram ? usd(l.share) : l.payout.fee == null ? "—" : usd(l.payout.fee)}
							</td>
							{perProgram ? null : <td>{l.programNames.join(", ") || "—"}</td>}
							<td><Status value={l.payout.status} /></td>
						</tr>
					))}
				</tbody>
			</table>
			{perProgram ? (
				<p className="ps-footnote">A payout can combine several programs. "From this program" is this program's rewards in it, before the withdrawal fee.</p>
			) : null}
		</div>
	)
}

const PAGE = 8

function RewardsTable({ rewards, showProgram, names }: { rewards: RewardRow[]; showProgram: boolean; names: Map<string, string> }) {
	const [includeZero, setIncludeZero] = useState(false)
	const [all, setAll] = useState(false)
	const zero = rewards.filter((r) => !r.amount).length
	const visible = includeZero ? rewards : rewards.filter((r) => r.amount)
	const shown = all ? visible : visible.slice(0, PAGE)
	return (
		<div className="ps-table-wrap">
			{zero ? (
				<label className="ps-toggle">
					<input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} />
					Include {plural(zero, "$0 event")}
				</label>
			) : null}
			{shown.length ? (
				<table className="ps-table">
					<thead>
						<tr>
							<th>Created</th>
							<th>Reward</th>
							{showProgram ? <th>Program</th> : null}
							<th className="num">Amount</th>
							<th>Status</th>
							<th>Payment date</th>
						</tr>
					</thead>
					<tbody>
						{shown.map((r) => (
							<tr key={r.id}>
								<td className="nowrap">{fmtDay(r.created)}</td>
								<td>{r.name}</td>
								{showProgram ? <td>{r.programIds.map((id) => names.get(id)).filter(Boolean).join(", ") || "—"}</td> : null}
								<td className="num">{r.amount == null ? "—" : usd(r.amount)}</td>
								<td><Status value={r.status} /></td>
								<td className="nowrap">{r.status === "declined" ? "—" : fmtDay(r.paymentDate)}</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				<p className="ps-note">No rewards with an amount yet.</p>
			)}
			{visible.length > PAGE ? (
				<button type="button" className="ps-more" onClick={() => setAll(!all)}>
					{all ? "Show fewer" : `Show all ${visible.length}`}
				</button>
			) : null}
		</div>
	)
}

function Status({ value }: { value: string }) {
	return (
		<span className="ps-status" data-status={value || "unknown"}>
			{value || "—"}
		</span>
	)
}
