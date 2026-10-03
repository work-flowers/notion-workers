import { createHash } from "node:crypto";

/**
 * Change detection for `zapsSync`, which is **incremental, not replace** — see
 * the "Execution cost" section of CLAUDE.md for why.
 *
 * In replace mode the platform discards sync state at the end of every cycle
 * (`ntn workers sync state get zapsSync` read `null` between cycles), so the
 * `dirs` / `versions` / `hashes` memoisation never survived to the next cycle
 * and every cycle was cold. Incremental mode keeps state, which lets a quiet
 * cycle emit nothing — but it also stops the platform sweeping rows, so
 * deletion is ours to do. These helpers are the pure part of both.
 */

export function contentHash(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Bump to force every row to be re-emitted on the next cycle after a deploy —
 * for a change to how properties are *built* that the fingerprint below would
 * not otherwise see (a new property, a renamed one, a different formatter).
 */
export const ROW_FORMAT = 1;

/**
 * Re-emit every row's properties at least this often, even if nothing looks
 * changed. Costs no upstream call — every value is already in hand — and heals
 * a row someone trashed by hand, which an upsert un-archives. Bodies are not
 * re-sent by this; they stay keyed on the README hash.
 */
export const FULL_EMIT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The fingerprint of one row's properties, as last emitted.
 *
 * `seed` must cover anything outside the row that changes what the platform
 * *stores* for the same values. The declared multi-select options are the case
 * that matters: an undeclared value is silently dropped, so declaring it later
 * does nothing unless the row is re-sent. Passing the declared options as the
 * seed makes that deploy re-emit every row on its own.
 */
export function rowFingerprint(properties: unknown, seed: unknown): string {
	return contentHash([ROW_FORMAT, seed, properties]);
}

export function isFullEmitDue(lastFullEmitAt: string | undefined, nowMs: number): boolean {
	if (!lastFullEmitAt) return true;
	const at = Date.parse(lastFullEmitAt);
	return Number.isNaN(at) || nowMs - at >= FULL_EMIT_INTERVAL_MS;
}

/**
 * Rows to delete: keys this sync has emitted before that are no longer deployed.
 *
 * Only call this on the execution that completes a cycle, with a fresh,
 * non-empty `listWorkflows` — the empty-list guard in the sync is what stops an
 * upstream blip from deleting every row.
 *
 * Known gap: a row created under replace mode whose workflow was deleted before
 * the first incremental cycle has no entry in `previousRows`, so nothing deletes
 * it. Delete it by hand if one turns up.
 */
export function deletedKeys(
	previousRows: Record<string, string>,
	liveIds: ReadonlySet<string>,
): string[] {
	return Object.keys(previousRows).filter((id) => !liveIds.has(id));
}
