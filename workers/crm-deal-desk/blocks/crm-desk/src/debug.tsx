/**
 * `?debug`: the binding-health and spike panel.
 *
 * Forty-odd property keys mapped by hand in a config panel will have a typo,
 * and a type mismatch unbinds a key *silently*. This lists every key with its
 * resolved property id, plus the three things the docs could not tell us and a
 * deploy can: the raw shape of a people value, what `pages.get` returns for a
 * Meeting Note and an Email, and whether the server-side filter was honoured.
 */

import { useState } from "react"

import type { UseDataSourceResult } from "@notionhq/custom-blocks"

import { asRelationIds } from "./rows.ts"
import type { PageFetchResult } from "./store.ts"

type Sources = Record<string, UseDataSourceResult>

export function DebugPanel({
	open,
	sources,
	getPage,
}: {
	open: boolean
	sources: Sources
	getPage: (id: string) => Promise<PageFetchResult>
}) {
	const [probe, setProbe] = useState<string>("")

	async function probeLinked() {
		const company = sources.companies?.items.find(
			(row) => asRelationIds(row.propertiesByKey.emails).length > 0,
		)
		const noteId = company ? asRelationIds(company.propertiesByKey.meetingNotes)[0] : undefined
		const emailId = company ? asRelationIds(company.propertiesByKey.emails)[0] : undefined
		const out: string[] = []
		for (const [label, id] of [
			["meeting note", noteId],
			["email", emailId],
		] as const) {
			if (id === undefined) {
				out.push(`${label}: no id to probe`)
				continue
			}
			const started = Date.now()
			const result = await Promise.race([
				getPage(id),
				new Promise<PageFetchResult>((resolve) =>
					setTimeout(() => resolve({ status: "error", message: "timed out (8 s)" }), 8000),
				),
			])
			out.push(`${label} ${id} (${Date.now() - started} ms):\n${JSON.stringify(result, null, 2)}`)
		}
		setProbe(out.join("\n\n"))
	}

	const largestEmailRelation = Math.max(
		0,
		...(sources.companies?.items ?? []).map(
			(row) => asRelationIds(row.propertiesByKey.emails).length,
		),
	)
	const sampleOwner =
		sources.deals?.items.find((row) => row.propertiesByKey.owner !== undefined)?.propertiesByKey
			.owner ?? sources.contacts?.items.find((row) => row.propertiesByKey.owner !== undefined)
			?.propertiesByKey.owner

	return (
		<details className="dd-debug" open={open}>
			<summary>Diagnostics: bindings and linked-page probe</summary>
			<table className="dd-table dd-debug-table">
				<thead>
					<tr>
						<th>Source</th>
						<th>Rows</th>
						<th>hasMore</th>
						<th>Error</th>
						<th>Unbound keys</th>
					</tr>
				</thead>
				<tbody>
					{Object.entries(sources).map(([key, src]) => {
						const unbound = Object.entries(src.propertyIdsByKey)
							.filter(([, id]) => id === undefined)
							.map(([k]) => k)
						return (
							<tr key={key}>
								<td>{key}</td>
								<td className="dd-num">{src.items.length}</td>
								<td>{String(src.hasMore)}</td>
								<td>{src.error?.message ?? ""}</td>
								<td data-unbound={unbound.length > 0 ? "true" : undefined}>
									{unbound.join(", ") || "—"}
								</td>
							</tr>
						)
					})}
				</tbody>
			</table>
			<p>
				Largest company email relation: <strong>{largestEmailRelation}</strong> ids (25 would
				suggest a cap).
			</p>
			<p>
				Sample owner value: <code>{JSON.stringify(sampleOwner)}</code>
			</p>
			<button type="button" className="dd-button dd-button-small" onClick={probeLinked}>
				Probe pages.get on one meeting note and one email
			</button>
			{probe ? <pre className="dd-debug-pre">{probe}</pre> : null}
		</details>
	)
}
