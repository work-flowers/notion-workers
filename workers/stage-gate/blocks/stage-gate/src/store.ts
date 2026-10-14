/**
 * The persistence surface the UI talks to. Two implementations: Notion
 * (`index.tsx`) and in-memory for `?mock` (`mock.ts`), so the mock exercises
 * the real seeding, status and advance flows without a binding or a write.
 */

import type { ChecklistItem, ItemStatus } from "./checklist.ts"
import type { Deliverable, Project } from "./gate.ts"

export type SaveResult = { ok: true } | { ok: false; message: string }

export type Store = {
	projects: Project[]
	deliverables: Deliverable[]
	loading: boolean
	/** The deliverables window hit the 999-row cap; some rows may be missing. */
	truncated: boolean
	/** Human-readable binding gaps, shown as a banner. Empty when healthy. */
	bindingProblems: string[]

	setStatus: (item: Deliverable, status: ItemStatus) => Promise<SaveResult>
	setPhase: (project: Project, phase: string) => Promise<SaveResult>
	createItems: (
		project: Project,
		items: readonly ChecklistItem[],
		onProgress: (created: number) => void,
	) => Promise<SaveResult>
}

/** Today as a local calendar day. */
export function today(): string {
	const now = new Date()
	return [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
	].join("-")
}
