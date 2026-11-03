/**
 * The persistence surface the views talk to. Two implementations: Notion
 * (`index.tsx`) and an in-memory one for `?mock` (`mock.ts`), so the mock runs
 * every real flow — guardrails included — with no binding and no write.
 */

import type { Catalogue, Line, Order } from "./rules.ts"

export type SaveResult = { ok: true } | { ok: false; message: string }

/** `lineIds` maps each `new-` line id to the id Notion gave it. */
export type SaveOrderResult = { ok: true; id: string; lineIds: Record<string, string> } | { ok: false; message: string }

/** The order fields the sheet edits. Stage and its gate fields move only through `moveOrder`. */
export type OrderDraft = Pick<Order, "title" | "customerId" | "siteId" | "deliveryDate" | "customerRef" | "notes">

/** A line as the sheet holds it. `id` starts with `new-` until it is saved. */
export type LineDraft = Omit<Line, "orderId"> & { removed: boolean }

export function isNewId(id: string): boolean {
	return id.startsWith("new-")
}

export type Store = Catalogue & {
	orders: Order[]
	lines: Line[]
	courierOptions: string[]
	cancellationOptions: string[]
	loading: boolean
	/** Configuration gaps, in words the person binding the block can act on. */
	bindingProblems: string[]

	/** Creates the order when `orderId` is null. Lines are created, updated or archived to match. */
	saveOrder: (orderId: string | null, draft: OrderDraft, lines: LineDraft[]) => Promise<SaveOrderResult>
	/** Writes the stage and whatever the gate collected. */
	moveOrder: (next: Order) => Promise<SaveResult>
}
