/**
 * Owner lookup. People properties arrive as bare user ids; `users.get` turns
 * one into a name. There are only ever a handful of owners, so a module-level
 * memo makes this effectively free after the first paint.
 */

import { useEffect, useState } from "react"

import { FETCH_TIMEOUT_MS, withTimeout } from "./linked-loader.ts"
import type { UserFetcher, UserSummary } from "./store.ts"

const memo = new Map<string, Promise<UserSummary | null>>()

export function resetUserMemo(): void {
	memo.clear()
}

function fetchUser(id: string, fetcher: UserFetcher): Promise<UserSummary | null> {
	const cached = memo.get(id)
	if (cached !== undefined) return cached
	const promise = withTimeout(fetcher(id), FETCH_TIMEOUT_MS, "users.get").catch(() => null)
	memo.set(id, promise)
	promise.then((user) => {
		if (user === null) memo.delete(id)
	})
	return promise
}

export type UserState = { status: "loading" } | { status: "ready"; user: UserSummary | null }

export function useUser(id: string | null, fetcher: UserFetcher): UserState {
	const [state, setState] = useState<UserState>(
		id === null ? { status: "ready", user: null } : { status: "loading" },
	)

	useEffect(() => {
		if (id === null) {
			setState({ status: "ready", user: null })
			return
		}
		let cancelled = false
		setState({ status: "loading" })
		fetchUser(id, fetcher).then((user) => {
			if (!cancelled) setState({ status: "ready", user })
		})
		return () => {
			cancelled = true
		}
	}, [id, fetcher])

	return state
}

/** Name, then email, then an honest fallback. */
export function userLabel(user: UserSummary | null): string {
	if (user === null) return "Unknown user"
	return user.name ?? user.email ?? "Unknown user"
}
