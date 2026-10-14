/**
 * The persistence surface the UI talks to. Two implementations: Notion
 * (`index.tsx`) and in-memory for `?mock` (`mock.ts`), so the mock exercises
 * the real seeding, status and advance flows without a binding or a write.
 */

import type { ChecklistItem } from "./checklist.ts"
import type { Deliverable, Project } from "./gate.ts"

export type SaveResult = { ok: true } | { ok: false; message: string }
/** Optional descriptive fields on a new project; blank ones are left unset. */
export type ProjectDetails = { make: string; model: string; variant: string }

export type CreateResult = { ok: true; id: string } | { ok: false; message: string }

export type Store = {
	projects: Project[]
	deliverables: Deliverable[]
	loading: boolean
	/** The deliverables window hit the 999-row cap; some rows may be missing. */
	truncated: boolean
	/** Human-readable binding gaps, shown as a banner. Empty when healthy. */
	bindingProblems: string[]

	/** Writes `next`'s status, completed date and file link (already validated by `applyChange`). */
	updateItem: (item: Deliverable, next: Deliverable) => Promise<SaveResult>
	setPhase: (project: Project, phase: string) => Promise<SaveResult>
	/** Creates a project in the first phase. Its checklist is seeded when it's opened. */
	createProject: (name: string, details: ProjectDetails) => Promise<CreateResult>
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
