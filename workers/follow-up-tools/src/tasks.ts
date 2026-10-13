import { queryDataSource, retrievePage } from "@work-flowers/notion-worker-shared";

/** Tasks data source in the workFlowers workspace. */
export const TASKS_DATA_SOURCE_ID = "27a91b07-11ac-81ed-973f-000ba6da1441";

const CLOSED_STATUSES = new Set(["Done", "Canceled"]);
/** Relations that tie a task to a client, deal or project. */
const CONTEXT_RELATIONS = ["Companies", "Deals", "Project"];

export interface TaskRecord {
	id: string;
	url: string;
	ticketId: number | null;
	title: string;
	summary: string;
	status: string;
	open: boolean;
	assignee: string | null;
	due: string | null;
	lastEdited: string;
	parentId: string | null;
	meetingNoteIds: string[];
	contextIds: string[];
}

/** Bare 32-hex id from a Notion id or URL, or null when there isn't one. */
export function normalizeId(idOrUrl: string): string | null {
	const hex = idOrUrl.replace(/-/g, "").match(/[0-9a-f]{32}(?![0-9a-f])/i);
	return hex ? hex[0].toLowerCase() : null;
}

const plain = (rich: unknown): string =>
	Array.isArray(rich) ? rich.map((r: any) => r?.plain_text ?? "").join("") : "";

const relationIds = (prop: any): string[] =>
	Array.isArray(prop?.relation)
		? prop.relation.map((r: any) => normalizeId(String(r?.id ?? ""))).filter(Boolean)
		: [];

export function parseTask(page: any): TaskRecord {
	const p = page.properties ?? {};
	const status = p.Status?.status?.name ?? "";
	const person = p.Assignee?.people?.[0];
	const unique = p["Ticket ID"]?.unique_id?.number;
	return {
		id: normalizeId(page.id) ?? page.id,
		url: page.url,
		ticketId: typeof unique === "number" ? unique : null,
		title: plain(p["Task name"]?.title).trim(),
		summary: plain(p.Summary?.rich_text).trim(),
		status,
		open: !CLOSED_STATUSES.has(status),
		assignee: person ? (person.name ?? person.id ?? null) : null,
		due: p["Due date"]?.date?.start ?? null,
		lastEdited: page.last_edited_time ?? "",
		parentId: relationIds(p["Parent task"])[0] ?? null,
		meetingNoteIds: relationIds(p["Meeting Notes"]),
		contextIds: CONTEXT_RELATIONS.flatMap((name) => relationIds(p[name])),
	};
}

/**
 * Every task, open and closed. ~900 rows is nine pages: cheap next to the Jev
 * calls, and closed tasks have to be candidates too ("already done", "follow-on
 * of a finished task"), so there is no status filter here — the shortlist in
 * match.ts decides which closed tasks Jev actually sees.
 */
export async function loadAllTasks(): Promise<TaskRecord[]> {
	const tasks: TaskRecord[] = [];
	let cursor: string | undefined;
	do {
		const res = await queryDataSource(TASKS_DATA_SOURCE_ID, {
			page_size: 100,
			...(cursor ? { start_cursor: cursor } : {}),
		});
		for (const page of res.results) {
			if (!page.in_trash && !page.archived) tasks.push(parseTask(page));
		}
		cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
	} while (cursor);
	return tasks;
}

/**
 * Every page id the meeting note relates to (companies, deals, projects, people,
 * tasks…). Schema-agnostic on purpose: a task "shares context" with the meeting
 * when one of its Companies/Deals/Project ids appears anywhere in this set.
 */
export async function loadMeetingRelationIds(meetingNoteId: string): Promise<Set<string>> {
	const page = await retrievePage(meetingNoteId);
	const ids = new Set<string>();
	for (const prop of Object.values<any>(page.properties ?? {})) {
		for (const id of relationIds(prop)) ids.add(id);
	}
	return ids;
}
