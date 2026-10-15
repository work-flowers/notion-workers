/**
 * `?mock`: the demo's three fictional platforms, held in memory.
 *
 * Mirrors the test data in the Notion demo workspace — A in Phase 2 with the
 * gate at 2/3, B in Phase 5 with the handover pack at 13/16, C in Phase 1 with
 * no deliverables (to exercise seeding). No real vehicles, part numbers or
 * measurements. Pick one with `?mock&project=a|b|c` (default a).
 */

import { useMemo, useRef, useState } from "react"

import { CHECKLIST, PHASES, STATUS } from "./checklist.ts"
import type { Deliverable, Project } from "./gate.ts"
import type { Person, Store } from "./store.ts"

/** Fictional people — the mock is what gets screen-recorded. */
const PEOPLE: Person[] = [
	{ id: "u-an", name: "An Nguyen", email: "an@example.com" },
	{ id: "u-bao", name: "Bao Tran", email: "bao@example.com" },
	{ id: "u-chris", name: "Chris Walker", email: "chris@example.com" },
	{ id: "u-linh", name: "Linh Pham", email: "linh@example.com" },
	{ id: "u-sam", name: "Sam Taylor", email: "sam@example.com" },
]

/** Who owns which item in the fixtures, by phase category. */
const OWNER_BY_CATEGORY: Record<string, string> = {
	Intake: "u-sam",
	Teardown: "u-an",
	Digital: "u-linh",
	Design: "u-chris",
}

export const MOCK_PROJECT_IDS = { a: "mock-a", b: "mock-b", c: "mock-c" } as const

const PROJECTS: Project[] = [
	{ id: MOCK_PROJECT_IDS.a, name: "Vehicle Platform A", phase: PHASES[1].name, deliverableIds: [] },
	{ id: MOCK_PROJECT_IDS.b, name: "Vehicle Platform B", phase: PHASES[4].name, deliverableIds: [] },
	{ id: MOCK_PROJECT_IDS.c, name: "Vehicle Platform C", phase: PHASES[0].name, deliverableIds: [] },
]

function rows(projectId: string, completed: Record<string, string>): Deliverable[] {
	return CHECKLIST.map((c) => ({
		id: `${projectId}-${c.key}`,
		key: c.key,
		item: c.item,
		projectIds: [projectId],
		phase: c.phase,
		category: c.category,
		description: c.description,
		format: c.format,
		mandatory: c.mandatory,
		status: c.key in completed ? STATUS.complete : STATUS.pending,
		completedDate: completed[c.key] ?? null,
		// Sample evidence on every completed item, so the demo starts compliant.
		fileLink: c.key in completed ? `https://example.sharepoint.com/sites/rnd/${projectId}/${c.key}` : null,
		// Leave the later phases unassigned so the demo has something to allocate.
		ownerIds: OWNER_BY_CATEGORY[c.category] ? [OWNER_BY_CATEGORY[c.category]] : [],
		order: c.order,
	}))
}

const DELIVERABLES: Deliverable[] = [
	...rows(MOCK_PROJECT_IDS.a, {
		baseline_weights: "2026-09-08",
		vehicle_condition_report: "2026-09-08",
		teardown_sequence_log: "2026-09-22",
		sensor_location_map: "2026-10-02",
	}),
	...rows(MOCK_PROJECT_IDS.b, {
		baseline_weights: "2026-05-11",
		vehicle_condition_report: "2026-05-11",
		teardown_sequence_log: "2026-05-25",
		sensor_location_map: "2026-05-27",
		electrical_pin_out_sheet: "2026-05-29",
		"3d_scan_data": "2026-06-10",
		bemm_compliance_audit: "2026-08-14",
		production_master_cad: "2026-08-28",
		master_assembly_record: "2026-09-18",
		tool_torque_spec_list: "2026-09-18",
		final_bom_fit_kit: "2026-09-25",
		adas_diagnostic_signoff: "2026-10-06",
		final_weight_compliance: "2026-10-08",
	}),
]

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function useMockStore(): Store {
	const [projects, setProjects] = useState(PROJECTS)
	const [deliverables, setDeliverables] = useState(DELIVERABLES)
	const nextId = useRef(0)

	return useMemo<Store>(
		() => ({
			projects,
			deliverables,
			loading: false,
			truncated: false,
			bindingProblems: [],
			people: PEOPLE,
			ownerBound: true,
			async updateItem(item, next) {
				await delay(250)
				setDeliverables((all) => all.map((d) => (d.id === item.id ? next : d)))
				return { ok: true }
			},
			async setPhase(project, phase) {
				await delay(300)
				setProjects((all) => all.map((p) => (p.id === project.id ? { ...p, phase } : p)))
				return { ok: true }
			},
			async createProject(name, _details) {
				await delay(300)
				const id = `new-project-${nextId.current++}`
				setProjects((all) => [...all, { id, name, phase: PHASES[0].name, deliverableIds: [] }])
				return { ok: true, id }
			},
			async createItems(project, items, onProgress) {
				for (const [i, c] of items.entries()) {
					await delay(60)
					const id = `new-${nextId.current++}`
					setDeliverables((all) => [
						...all,
						{
							id,
							key: c.key,
							item: c.item,
							projectIds: [project.id],
							phase: c.phase,
							category: c.category,
							description: c.description,
							format: c.format,
							mandatory: c.mandatory,
							status: STATUS.pending,
							completedDate: null,
							fileLink: null,
							ownerIds: [],
							order: c.order,
						},
					])
					onProgress(i + 1)
				}
				return { ok: true }
			},
		}),
		[projects, deliverables],
	)
}
