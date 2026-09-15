/**
 * Loads a record's linked Meeting Notes / Emails.
 *
 * Why this exists rather than a `useDataSource` call: both source databases
 * are past the 999-row query cap and relations cannot be filtered
 * server-side, so the only complete way to a record's linked pages is
 * `pages.get` on each relation id. This module makes that tolerable:
 *
 * - **Warm cache first.** When the optional cache bindings are mapped, the
 *   newest rows are already in memory; only ids outside them are fetched.
 * - **Module-level memo.** A fetched page is kept for the life of the
 *   sandbox, so switching tabs and back costs nothing.
 * - **Own timeout.** The bridge has no timeout and silently drops a result it
 *   cannot parse, so an un-raced `pages.get` can hang forever.
 * - **Bounded concurrency, batches from the newest end.** A company with 200
 *   emails paints its 30 most recent quickly; the rest is a "Load more".
 */

import { useEffect, useMemo, useRef, useState } from "react"

import {
	LINKED_BATCH_SIZE,
	pickBatch,
	sortNewestFirst,
	toLinkedRecord,
	type LinkedFailure,
	type LinkedKind,
	type LinkedRecord,
} from "./linked.ts"
import type { PageFetcher } from "./store.ts"

export const FETCH_TIMEOUT_MS = 8000
export const FETCH_CONCURRENCY = 4

type Loaded = { ok: true; record: LinkedRecord } | { ok: false; failure: LinkedFailure }

const memo = new Map<string, Promise<Loaded>>()

/** Test seam: forget everything. */
export function resetLinkedMemo(): void {
	memo.clear()
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)
		promise.then(
			(value) => {
				clearTimeout(timer)
				resolve(value)
			},
			(error: unknown) => {
				clearTimeout(timer)
				reject(error)
			},
		)
	})
}

/** Run `fn` over `items` with at most `concurrency` in flight; order preserved. */
export async function runPool<T, R>(
	items: readonly T[],
	fn: (item: T) => Promise<R>,
	concurrency = FETCH_CONCURRENCY,
): Promise<R[]> {
	const results: R[] = new Array(items.length)
	let next = 0
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (next < items.length) {
			const index = next++
			results[index] = await fn(items[index] as T)
		}
	})
	await Promise.all(workers)
	return results
}

function fetchOne(id: string, kind: LinkedKind, fetcher: PageFetcher): Promise<Loaded> {
	const cached = memo.get(id)
	if (cached !== undefined) return cached

	const promise: Promise<Loaded> = withTimeout(fetcher(id), FETCH_TIMEOUT_MS, "pages.get")
		.then((result): Loaded => {
			if (result.status === "error") {
				return { ok: false, failure: { id, kind, error: result.message } }
			}
			return { ok: true, record: toLinkedRecord(result.page, kind) }
		})
		.catch((error: unknown): Loaded => ({
			ok: false,
			failure: { id, kind, error: error instanceof Error ? error.message : String(error) },
		}))

	memo.set(id, promise)
	// A failure is not worth remembering across a retry — the next mount should
	// try again rather than replay the timeout.
	promise.then((loaded) => {
		if (!loaded.ok) memo.delete(id)
	})
	return promise
}

export type LinkedState = {
	records: LinkedRecord[]
	loading: boolean
	/** Ids that could not be fetched in the loaded batches. */
	failed: number
	/** Ids not yet attempted. */
	remaining: number
	loadMore: () => void
}

/**
 * The linked records for one relation, newest first.
 *
 * `ids` is the relation array as Notion stores it. The hook resolves what it
 * can from `warm` immediately, fetches the first batch of the rest from the
 * newest end, and exposes `loadMore` for the remainder.
 */
export function useLinkedRecords(
	ids: readonly string[],
	kind: LinkedKind,
	fetcher: PageFetcher,
	warm: ReadonlyMap<string, LinkedRecord>,
	batchSize = LINKED_BATCH_SIZE,
): LinkedState {
	// Stable identity for the ids so the effect keys on content, not array identity.
	const idsKey = ids.join("|")

	const { warmRecords, coldIds } = useMemo(() => {
		const warmRecords: LinkedRecord[] = []
		const coldIds: string[] = []
		for (const id of ids) {
			const hit = warm.get(id)
			if (hit !== undefined) warmRecords.push(hit)
			else coldIds.push(id)
		}
		return { warmRecords, coldIds }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [idsKey, warm])

	const [fetched, setFetched] = useState<LinkedRecord[]>([])
	const [failed, setFailed] = useState(0)
	const [attempted, setAttempted] = useState(0)
	const [loading, setLoading] = useState(false)
	const [wanted, setWanted] = useState(batchSize)
	const generation = useRef(0)

	// A new record resets everything.
	useEffect(() => {
		generation.current += 1
		setFetched([])
		setFailed(0)
		setAttempted(0)
		setWanted(batchSize)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [idsKey, kind])

	useEffect(() => {
		if (attempted >= Math.min(wanted, coldIds.length)) return
		const batch = pickBatch(coldIds, attempted, Math.min(batchSize, wanted - attempted))
		if (batch.length === 0) return

		const myGeneration = generation.current
		setLoading(true)
		runPool(batch, (id) => fetchOne(id, kind, fetcher)).then((loaded) => {
			if (myGeneration !== generation.current) return
			const records: LinkedRecord[] = []
			let failures = 0
			for (const item of loaded) {
				if (item.ok) records.push(item.record)
				else failures += 1
			}
			setFetched((current) => [...current, ...records])
			setFailed((current) => current + failures)
			setAttempted((current) => current + batch.length)
			setLoading(false)
		})
	}, [attempted, wanted, coldIds, kind, fetcher, batchSize])

	const records = useMemo(
		() => sortNewestFirst([...warmRecords, ...fetched]),
		[warmRecords, fetched],
	)

	return {
		records,
		loading,
		failed,
		remaining: Math.max(0, coldIds.length - attempted),
		loadMore: () => setWanted((current) => current + batchSize),
	}
}
