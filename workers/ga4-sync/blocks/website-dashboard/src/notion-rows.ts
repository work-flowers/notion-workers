/**
 * custom-blocks 0.6 → 0.1 row conversion, pure. `notion.ts` holds the hook
 * that feeds it; this half has no runtime SDK import so `node --test` can load
 * it (the SDK's React entry pulls in CSS).
 *
 * 0.6 delivers each row as `{ page, data }` with typed property objects
 * (`{ type: "title", title: [...] }`). The readers in `rows.ts` were written
 * against 0.1's flattened values (plain strings, option names, `{ start_date }`
 * dates, `{ id, table }` pointers) on a `{ id, propertiesByKey, update }` row.
 * `flatten` and `toRow` rebuild that shape.
 *
 * Copied byte-for-byte into every block, with `notion.ts`; see there for why.
 */

import type { DataSourceQueryItem, NotionDataSourceSchema } from "@notionhq/custom-blocks/data-sources"
import type {
	NotionPage,
	NotionPageCover,
	NotionPageIcon,
	NotionPagePropertyInputMap,
	NotionPagePropertyValue,
} from "@notionhq/custom-blocks/pages"

export type { NotionPagePropertyInputMap }

/** A date as 0.1 delivered it. Times keep everything after the `T`, offset included. */
export type FlatDate =
	| { type: "date"; start_date: string }
	| { type: "daterange"; start_date: string; end_date: string }
	| { type: "datetime"; start_date: string; start_time: string; time_zone?: string }
	| {
			type: "datetimerange"
			start_date: string
			start_time: string
			end_date: string
			end_time: string
			time_zone?: string
	  }

export type RecordPointer = { id: string; table: string }

/** A property value as 0.1 delivered it. Empty values are `undefined`. */
export type FlatValue = string | number | boolean | FlatDate | string[] | RecordPointer[]

export type PropertySchema = NotionDataSourceSchema["propertiesById"][string]

type UpdateResult = Awaited<ReturnType<NotionPage["updateByKey"]>>

export type RowUpdateArgs = {
	properties?: NotionPagePropertyInputMap
	icon?: NotionPageIcon
	cover?: NotionPageCover
	is_archived?: boolean
}

/** A data-source row in the 0.1 shape. */
export type Row = {
	id: string
	is_archived?: boolean
	in_trash?: boolean
	propertiesById: { [propertyId: string]: FlatValue | undefined }
	propertiesByKey: { [key: string]: FlatValue | undefined }
	/** Writes by manifest property key, through the row's source binding. */
	update(args: RowUpdateArgs): Promise<UpdateResult>
	archive(): Promise<UpdateResult>
	unarchive(): Promise<UpdateResult>
	/** The 0.6 reference, for anything the 0.1 shape doesn't cover. */
	page: NotionPage
}

function splitDateTime(value: string): { date: string; time?: string } {
	const t = value.indexOf("T")
	return t === -1 ? { date: value } : { date: value.slice(0, t), time: value.slice(t + 1) }
}

/** `{ start, end?, time_zone? }` → 0.1's date variants. */
export function flattenDate(input: { start: string; end?: string | null; time_zone?: string | null }): FlatDate {
	const start = splitDateTime(input.start)
	const end = input.end ? splitDateTime(input.end) : undefined
	const zone = input.time_zone ? { time_zone: input.time_zone } : {}
	if (start.time === undefined) {
		return end ? { type: "daterange", start_date: start.date, end_date: end.date } : { type: "date", start_date: start.date }
	}
	if (!end) return { type: "datetime", start_date: start.date, start_time: start.time, ...zone }
	return {
		type: "datetimerange",
		start_date: start.date,
		start_time: start.time,
		end_date: end.date,
		end_time: end.time ?? "00:00",
		...zone,
	}
}

function plainText(items: readonly Record<string, unknown>[]): string {
	let out = ""
	for (const item of items) {
		if (typeof item.plain_text === "string") out += item.plain_text
		else {
			const text = item.text as { content?: unknown } | undefined
			if (text && typeof text.content === "string") out += text.content
		}
	}
	return out
}

const nonEmpty = (s: string | null | undefined): string | undefined => (s ? s : undefined)

/** A 0.6 typed property value → the value 0.1 would have delivered for it. */
export function flatten(value: NotionPagePropertyValue | null | undefined): FlatValue | undefined {
	if (!value) return undefined
	switch (value.type) {
		case "title":
			return plainText(value.title)
		case "rich_text":
			return plainText(value.rich_text)
		case "number":
			return value.number ?? undefined
		case "checkbox":
			return value.checkbox
		case "url":
			return nonEmpty(value.url)
		case "email":
			return nonEmpty(value.email)
		case "phone_number":
			return nonEmpty(value.phone_number)
		case "select":
			return nonEmpty(value.select?.name)
		case "status":
			return nonEmpty(value.status?.name)
		case "multi_select":
			return value.multi_select.flatMap((o) => (o.name ? [o.name] : []))
		case "date":
			return value.date ? flattenDate(value.date) : undefined
		case "people":
			return value.people.map((u) => ({ id: u.id, table: u.object === "group" ? "group" : "notion_user" }))
		case "relation":
			return value.relation.map((r) => ({ id: r.id, table: "block" }))
		case "created_time":
			return value.created_time ? flattenDate({ start: value.created_time }) : undefined
		case "last_edited_time":
			return value.last_edited_time ? flattenDate({ start: value.last_edited_time }) : undefined
		case "created_by":
			return value.created_by ? [{ id: value.created_by.id, table: value.created_by.table }] : []
		case "last_edited_by":
			return value.last_edited_by ? [{ id: value.last_edited_by.id, table: value.last_edited_by.table }] : []
		case "files":
			return nonEmpty(value.files.map((f) => f.name).join(", "))
		case "place":
			return nonEmpty(value.place ? (value.place.name ?? value.place.address ?? null) : null)
		case "unique_id":
			return nonEmpty(value.unique_id)
		case "formula":
			return nonEmpty(value.formula)
		case "rollup":
			return nonEmpty(value.rollup)
		case "button":
			return nonEmpty(value.button)
		case "verification":
			return nonEmpty(value.verification)
	}
}

/**
 * One query item → a 0.1 row. Built-in timestamps and actors are added under
 * their 0.1 ids (`created_time`, …) as well, since they have no manifest key.
 */
export function toRow(item: DataSourceQueryItem, propertyIdsByKey: Record<string, string | undefined>): Row {
	const { page, data } = item
	const propertiesById: Row["propertiesById"] = {}
	if (data.createdTime) propertiesById.created_time = flattenDate({ start: data.createdTime })
	if (data.lastEditedTime) propertiesById.last_edited_time = flattenDate({ start: data.lastEditedTime })
	if (data.createdBy) propertiesById.created_by = [{ id: data.createdBy.id, table: data.createdBy.table }]
	if (data.lastEditedBy) propertiesById.last_edited_by = [{ id: data.lastEditedBy.id, table: data.lastEditedBy.table }]
	for (const value of Object.values(data.properties)) {
		if (value) propertiesById[value.id] = flatten(value)
	}
	const propertiesByKey: Row["propertiesByKey"] = {}
	for (const [key, id] of Object.entries(propertyIdsByKey)) {
		if (id !== undefined) propertiesByKey[key] = propertiesById[id]
	}
	return {
		id: data.pageKey,
		is_archived: data.isArchived,
		in_trash: data.inTrash,
		propertiesById,
		propertiesByKey,
		page,
		update: ({ is_archived, ...rest }) =>
			page.updateByKey(is_archived === undefined ? rest : { ...rest, isArchived: is_archived }),
		archive: () => page.archive(),
		unarchive: () => page.unarchive(),
	}
}
