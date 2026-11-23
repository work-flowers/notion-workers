/**
 * custom-blocks 0.6 adapter, kept so the rest of the block reads rows the way
 * it did on 0.1.x.
 *
 * 0.6 moved schemas from the query snapshot to `NotionDataSource.get()` and
 * replaced `useDataSource` with `useQuerySubscription`. `useDataSource` here
 * keeps the old hook's flat `{ items, propertyIdsByKey, propertySchemasByKey,
 * … }` contract; `notion-rows.ts` turns each row back into the 0.1 shape.
 *
 * Both files are copied into every block in the repo, byte-identical, so a fix
 * is a copy, not a merge. Blocks don't share code through `packages/shared`
 * yet: it is server-side CommonJS, and pulling it into a browser bundle needs
 * Vite and deploy changes this migration didn't take on.
 */

import { NotionDataSource } from "@notionhq/custom-blocks/data-sources"
import type {
	CustomBlockQueryDataSourceErrorInfo,
	DataSourceQueryOptions,
	DataSourceState,
	NotionDataSourceSchema,
} from "@notionhq/custom-blocks/data-sources"
import { useQuerySubscription } from "@notionhq/custom-blocks/react"
import { useEffect, useMemo, useState } from "react"

import { toRow, type PropertySchema, type Row } from "./notion-rows.ts"

export * from "./notion-rows.ts"

export type DataSourceOptions = DataSourceQueryOptions & { limit?: number }

/** The 0.1 `useDataSource` snapshot. */
export type DataSourceView = {
	items: Row[]
	propertyIdsByKey: Record<string, string | undefined>
	/** Undefined until the source's metadata loads, or when it is unbound or unavailable. */
	collectionSchema?: NotionDataSourceSchema
	propertySchemasById: Record<string, PropertySchema>
	propertySchemasByKey: Record<string, PropertySchema | undefined>
	isLoading: boolean
	hasMore: boolean
	error?: { code?: string; message: string }
}

/** Follows the source's binding and schema (`NotionDataSource.subscribe`). */
function useSourceState(key: string): DataSourceState {
	const [state, setState] = useState<DataSourceState>({ status: "loading" })
	useEffect(() => {
		setState({ status: "loading" })
		return NotionDataSource.fromKey(key).subscribe(setState)
	}, [key])
	return state
}

/**
 * 0.1's `useDataSource(key, { limit, filter, sorts })`, over 0.6's
 * `useQuerySubscription` plus the source subscription for schemas.
 */
export function useDataSource(key: string, options: DataSourceOptions = {}): DataSourceView {
	const { limit, ...queryOptions } = options
	const query = useQuerySubscription(NotionDataSource.fromKey(key).createQuery(queryOptions), {
		...(limit === undefined ? {} : { limit }),
	})
	const source = useSourceState(key)

	return useMemo<DataSourceView>(() => {
		const schema =
			source.status === "success" && source.value.type === "available" ? source.value.schema : undefined
		const snapshot = query.status === "success" ? query.value : undefined
		const propertyIdsByKey =
			snapshot?.propertyIdsByKey ??
			(source.status === "success" && source.value.type === "available" ? source.value.propertyIdsByKey : {})
		const propertySchemasById: Record<string, PropertySchema> = schema ? { ...schema.propertiesById } : {}
		const propertySchemasByKey: Record<string, PropertySchema | undefined> = {}
		for (const [k, id] of Object.entries(propertyIdsByKey)) {
			propertySchemasByKey[k] = id === undefined ? undefined : propertySchemasById[id]
		}
		const queryError: CustomBlockQueryDataSourceErrorInfo | { message: string } | undefined =
			query.status === "error" ? query.error : snapshot?.error
		// An unbound or unavailable source is not an error here, as in 0.1: it
		// shows as a missing `collectionSchema`, and blocks word that themselves.
		const error = queryError ?? (source.status === "error" ? source.error : undefined)
		return {
			items: snapshot ? snapshot.items.map((item) => toRow(item, propertyIdsByKey)) : [],
			propertyIdsByKey,
			collectionSchema: schema,
			propertySchemasById,
			propertySchemasByKey,
			isLoading: query.status === "loading" || (snapshot?.isLoading ?? false) || source.status === "loading",
			hasMore: snapshot?.hasMore ?? false,
			...(error ? { error: { code: "code" in error ? String(error.code) : undefined, message: error.message } } : {}),
		}
	}, [key, query, source])
}
