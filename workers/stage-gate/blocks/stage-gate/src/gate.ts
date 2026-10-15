/**
 * Gate arithmetic. Pure: no React, no SDK — `test/gate.test.ts` covers it.
 *
 * The gate is computed here from the deliverables rather than read from the
 * project's `Gate ready` formula, because the block updates statuses
 * optimistically and a formula would lag a round trip behind.
 */

import {
	CHECKLIST,
	FINAL_PHASE,
	PHASES,
	STATUS,
	type ChecklistItem,
	type PhaseDef,
} from "./checklist.ts"

export type Project = {
	id: string
	name: string
	phase: string | null
	/** Ids from the project's own Deliverables relation, if bound. */
	deliverableIds: string[]
}

export type Deliverable = {
	id: string
	key: string | null
	item: string
	projectIds: string[]
	phase: string | null
	category: string | null
	description: string | null
	format: string | null
	mandatory: boolean
	status: string | null
	completedDate: string | null
	fileLink: string | null
	/** User ids from the Owner property. The picker sets one; more set in Notion are kept until changed. */
	ownerIds: string[]
	order: number | null
}

/** What an item edit may change. Omitted fields are left as they are. */
export type ItemChange = { status?: string; fileLink?: string | null; ownerIds?: string[] }

/**
 * Applies a change and checks the one rule edits must obey: **a Complete item
 * needs a file link.** N/A and Pending don't. Enforced on edits only — rows
 * that were completed before the rule existed keep their status and are
 * flagged in the UI instead (`missingEvidence`).
 */
export function applyChange(
	item: Deliverable,
	change: ItemChange,
	today: string,
): { ok: true; next: Deliverable } | { ok: false; message: string } {
	const status = change.status ?? item.status
	const fileLink = change.fileLink !== undefined ? normaliseLink(change.fileLink) : item.fileLink
	if (status === STATUS.complete && fileLink === null) {
		return { ok: false, message: "Add a file link before marking this item Complete." }
	}
	const completedDate = status === STATUS.complete ? (item.completedDate ?? today) : null
	const ownerIds = change.ownerIds ?? item.ownerIds
	return { ok: true, next: { ...item, status, fileLink, completedDate, ownerIds } }
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((id, i) => sameId(id, b[i]))
}

export function normaliseLink(link: string | null): string | null {
	const trimmed = link?.trim() ?? ""
	return trimmed.length > 0 ? trimmed : null
}

/** Complete, but without the file link the rule now requires. */
export function missingEvidence(item: Deliverable): boolean {
	return item.status === STATUS.complete && item.fileLink === null
}

export function isDone(status: string | null): boolean {
	return status === STATUS.complete || status === STATUS.na
}

/** Notion ids arrive both with and without dashes. */
export function sameId(a: string, b: string): boolean {
	return a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase()
}

export function deliverablesFor(projectId: string, all: readonly Deliverable[]): Deliverable[] {
	return all
		.filter((d) => d.projectIds.some((id) => sameId(id, projectId)))
		.sort(byOrder)
}

function byOrder(a: Deliverable, b: Deliverable): number {
	const oa = a.order ?? orderFromKey(a.key) ?? Number.MAX_SAFE_INTEGER
	const ob = b.order ?? orderFromKey(b.key) ?? Number.MAX_SAFE_INTEGER
	return oa - ob || a.item.localeCompare(b.item)
}

function orderFromKey(key: string | null): number | null {
	return CHECKLIST.find((c) => c.key === key)?.order ?? null
}

/**
 * Index of the project's phase in `PHASES`; `PHASES.length` once handed over;
 * `null` when the phase is empty or not one the checklist knows.
 */
export function phaseIndex(phase: string | null): number | null {
	if (phase === FINAL_PHASE) return PHASES.length
	const i = PHASES.findIndex((p) => p.name === phase)
	return i === -1 ? null : i
}

/** The option the Advance button writes, or `null` when there is nowhere to go. */
export function nextPhase(phase: string | null): string | null {
	const i = phaseIndex(phase)
	if (i === null || i >= PHASES.length) return null
	return i === PHASES.length - 1 ? FINAL_PHASE : PHASES[i + 1].name
}

export type PhaseState = "done" | "current" | "future"

export type PhaseView = {
	phase: PhaseDef
	index: number
	state: PhaseState
	items: Deliverable[]
	mandatoryTotal: number
	mandatoryDone: number
	/** Every mandatory item is Complete or N/A (vacuously true with none). */
	ready: boolean
}

/**
 * A deliverable's phase: its own Phase value, else the checklist's phase for
 * its key. Rows that resolve to neither land in `unphased`.
 */
function resolvePhase(d: Deliverable): string | null {
	if (d.phase && PHASES.some((p) => p.name === d.phase)) return d.phase
	return CHECKLIST.find((c) => c.key === d.key)?.phase ?? null
}

export function buildPhases(
	currentPhase: string | null,
	items: readonly Deliverable[],
): { phases: PhaseView[]; unphased: Deliverable[] } {
	const current = phaseIndex(currentPhase)
	const unphased: Deliverable[] = []
	const byPhase = new Map<string, Deliverable[]>()
	for (const d of items) {
		const p = resolvePhase(d)
		if (p === null) unphased.push(d)
		else byPhase.set(p, [...(byPhase.get(p) ?? []), d])
	}

	const phases = PHASES.map((phase, index): PhaseView => {
		const list = byPhase.get(phase.name) ?? []
		const mandatory = list.filter((d) => d.mandatory)
		const mandatoryDone = mandatory.filter((d) => isDone(d.status)).length
		const state: PhaseState =
			current === null ? "future" : index < current ? "done" : index === current ? "current" : "future"
		return {
			phase,
			index,
			state,
			items: list,
			mandatoryTotal: mandatory.length,
			mandatoryDone,
			ready: mandatoryDone === mandatory.length,
		}
	})
	return { phases, unphased }
}

export type Gate = {
	/** The current phase's view, or `null` once handed over / phase unknown. */
	current: PhaseView | null
	canAdvance: boolean
	next: string | null
	handover: { done: number; total: number }
}

export function gate(currentPhase: string | null, items: readonly Deliverable[]): Gate {
	const { phases } = buildPhases(currentPhase, items)
	const current = phases.find((p) => p.state === "current") ?? null
	const next = nextPhase(currentPhase)
	return {
		current,
		next,
		// No checklist at all means nothing has been checked, not that the gate is met.
		canAdvance: items.length > 0 && current !== null && current.ready && next !== null,
		handover: {
			done: items.filter((d) => isDone(d.status)).length,
			total: items.length,
		},
	}
}

/** Checklist items the project has no row for, matched on Item key. */
export function missingItems(items: readonly Deliverable[]): ChecklistItem[] {
	const have = new Set(items.map((d) => d.key).filter((k): k is string => k !== null))
	return CHECKLIST.filter((c) => !have.has(c.key))
}

/**
 * Whether the block may create checklist rows for a project on load.
 *
 * Seeding is automatic, so it is deliberately conservative: only when the
 * project has *no* deliverables by both counts — no row in the loaded window
 * points at it, and its own relation (when bound) is empty — and only when the
 * window is complete. A truncated or still-loading window could hide rows that
 * exist, and seeding then would duplicate the whole checklist.
 */
export function shouldSeed(args: {
	project: Project
	rows: readonly Deliverable[]
	loading: boolean
	truncated: boolean
	alreadyAttempted: boolean
}): boolean {
	const { project, rows, loading, truncated, alreadyAttempted } = args
	if (loading || truncated || alreadyAttempted) return false
	if (project.deliverableIds.length > 0) return false
	return deliverablesFor(project.id, rows).length === 0
}
