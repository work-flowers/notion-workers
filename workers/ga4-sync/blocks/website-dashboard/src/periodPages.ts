import { createContext, useContext } from "react"

import type { PageDayRow } from "./aggregate.ts"

/**
 * How the drill-down reads 📄 Pages Path Report for one period.
 *
 * The report is too big to load whole (see `PageDayRow`), so unlike the other
 * three data sources it isn't handed to `App` as rows. Instead each root
 * supplies a hook: the Notion root subscribes with a date filter, `?mock`
 * slices the fixture. The hook is fixed for the root's lifetime, so calling
 * it through context keeps the rules of hooks.
 */
export type PeriodPagesResult = {
	status: "unbound" | "loading" | "error" | "ready"
	rows: PageDayRow[]
	/** The period had more page-days than one query returns (999). */
	hasMore: boolean
	message?: string
}

export type UsePeriodPages = (from: string, to: string) => PeriodPagesResult

const UNBOUND: PeriodPagesResult = { status: "unbound", rows: [], hasMore: false }

export const PeriodPagesContext = createContext<UsePeriodPages>(() => UNBOUND)

export function usePeriodPages(from: string, to: string): PeriodPagesResult {
	return useContext(PeriodPagesContext)(from, to)
}
