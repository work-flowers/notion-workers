import { useMemo, useState } from "react"

/**
 * A column of the table view. `sortValue` is what the header click orders by —
 * kept separate from `render` so a formatted cell ("9.3%", "—") still sorts
 * numerically.
 */
export type Column<T> = {
	key: string
	label: string
	/** Left-align the text. Numbers stay right-aligned so digits line up. */
	left?: boolean
	sortValue: (row: T) => number | string | null
	render: (row: T) => React.ReactNode
}

export type SortState = { key: string; dir: "asc" | "desc" }

/**
 * Compare two cells. Unknown values (`null` — a rate with no denominator) always
 * sort last whichever direction is active: they are missing, not small.
 */
function compare(
	a: number | string | null,
	b: number | string | null,
	dir: "asc" | "desc",
): number {
	if (a === null && b === null) return 0
	if (a === null) return 1
	if (b === null) return -1
	const sign = dir === "asc" ? 1 : -1
	if (typeof a === "number" && typeof b === "number") return (a - b) * sign
	return String(a).localeCompare(String(b)) * sign
}

export function DataTable<T extends { id: string }>({
	columns,
	rows,
	initialSort,
	caption,
}: {
	columns: Column<T>[]
	rows: T[]
	initialSort: SortState
	caption: string
}) {
	const [sort, setSort] = useState<SortState>(initialSort)

	const sorted = useMemo(() => {
		const column = columns.find((c) => c.key === sort.key)
		if (!column) return rows
		// Copy first: sort mutates, and the incoming array is memoised upstream.
		return [...rows].sort((a, b) =>
			compare(column.sortValue(a), column.sortValue(b), sort.dir),
		)
	}, [columns, rows, sort])

	function toggle(key: string) {
		setSort((prev) =>
			prev.key === key
				? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
				: // First click on a new column shows the most useful end of it:
					// descending, since these are all "biggest/latest first" questions.
					{ key, dir: "desc" },
		)
	}

	return (
		<div className="nl-table-wrap">
			<table className="nl-table">
				<caption className="nl-sr-only">{caption}</caption>
				<thead>
					<tr>
						{columns.map((column) => {
							const active = sort.key === column.key
							return (
								<th
									key={column.key}
									scope="col"
									className={column.left ? "nl-col-left" : undefined}
									aria-sort={
										active
											? sort.dir === "asc"
												? "ascending"
												: "descending"
											: "none"
									}
								>
									<button
										type="button"
										className={`nl-sort${active ? " is-active" : ""}`}
										onClick={() => toggle(column.key)}
									>
										{column.label}
										{/* Only ↑/↓ — U+2195 (↕) renders with emoji presentation on
										    macOS and reads as a coloured box, not a caret. The
										    inactive caret is a hover/focus hint, styled in CSS. */}
										<span className="nl-sort-caret" aria-hidden="true">
											{active && sort.dir === "asc" ? "↑" : "↓"}
										</span>
									</button>
								</th>
							)
						})}
					</tr>
				</thead>
				<tbody>
					{sorted.map((row) => (
						<tr key={row.id}>
							{columns.map((column) => (
								<td
									key={column.key}
									className={column.left ? "nl-col-left" : undefined}
								>
									{column.render(row)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
