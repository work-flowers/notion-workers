import { choiceProbabilities, type JevQuestion, noulOf } from "./jev.js";
import type { TaskRecord } from "./tasks.js";

/**
 * Jev call 2: how does each validated candidate relate to existing tasks?
 *
 * Code builds a pool per candidate (all open tasks, plus a lexical shortlist of
 * closed ones), Jev classifies every candidate–task pair into one relationship,
 * and code turns the probabilities into a recommendation. One request per
 * candidate: the state is that candidate, and each question carries its own
 * existing task in structured instructions, so no question has to pick its
 * task out of a large shared state (a known Jev weak spot).
 */

export interface MatchCandidate {
	ref: string;
	title: string;
	description: string;
	owner: string | null;
	/** Client, prospect or project the task is for; null for internal admin. */
	client: string | null;
}

/** Open tasks are all compared unless there are more than this many. */
export const MAX_OPEN = 80;
/** Closed tasks compared per candidate, chosen by lexical overlap. */
export const MAX_CLOSED = 15;
/** Matches returned per candidate. */
export const MAX_MATCHES = 5;
/**
 * Parent/child/related links need the same client, deal or project, asked as
 * its own Noul. Folded into the relationship options, Jev ignored it: an MRT
 * demo was filed under a Carousell workshop at p=0.97, and an NUS training
 * session came back related to an MRT proposal. Split, it's a literal question.
 * It gates `same` too: an MRT proposal otherwise matched a months-old proposal
 * for another Australian client. On the MRT test meeting, true pairs scored
 * 0.77–0.93 and wrong-client pairs 0.55–0.69, hence 0.7.
 */
export const MIN_SAME_SCOPE = 0.7;

const SCOPE_QUESTION = {
	type: "noul" as const,
	criteria: {
		true: "Both name or clearly refer to the same client, prospect, deal, event or internal project.",
		false:
			"Different clients or projects, or nothing ties them to the same one. Both being about Notion, training, demos, proposals or sales is not enough.",
	},
};

/** Below this probability of *any* relationship, a pair isn't reported. */
export const MIN_MATCH = 0.35;
/**
 * A duplicate at or above SURE is acted on; between MAYBE and SURE the agent
 * should ask. Same for an existing parent. Starting values, not fitted.
 */
export const SURE = 0.6;
export const MAYBE = 0.35;

export const RELATIONSHIPS = {
	same: "The same intended outcome: completing either one would complete the other. Same deliverable or action, for the same recipient, client or purpose, and the same occurrence if the work recurs. Different wording, or more detail on one side, still counts as the same.",
	existing_contains_candidate:
		"`existing_task` is broader, and `candidate` is one step, part or sub-deliverable of it.",
	candidate_contains_existing:
		"`candidate` is broader, and `existing_task` is one step, part or sub-deliverable of it.",
	related:
		"Different outcomes where one depends on, enables or follows on from the other, or a new occurrence of the same recurring task.",
	unrelated: "No dependency or part-of relationship; at most a shared general theme.",
} as const;
export type Relationship = keyof typeof RELATIONSHIPS;

// ---------------------------------------------------------------------------
// Pool selection

const STOPWORDS = new Set(
	"the and for with from that this into onto about after before over under our their your his her its are was were will would should could can may might has have had not but all any each per via also then than when what which who whom how why where task tasks meeting follow up".split(
		" ",
	),
);

export function tokens(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length >= 3 && !STOPWORDS.has(t))
		.map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t));
}

export interface PoolContext {
	meetingNoteId: string | null;
	meetingRelationIds: Set<string>;
}

const fromMeeting = (t: TaskRecord, ctx: PoolContext) =>
	ctx.meetingNoteId !== null && t.meetingNoteIds.includes(ctx.meetingNoteId);
const sharesContext = (t: TaskRecord, ctx: PoolContext) =>
	t.contextIds.some((id) => ctx.meetingRelationIds.has(id));

/**
 * IDF-weighted word overlap between the candidate and each task, plus a boost
 * for tasks tied to the same meeting or the same client/deal/project. It only
 * has to get the right closed tasks into a shortlist of 15; Jev does the judging.
 */
export function rankTasks(
	candidate: MatchCandidate,
	tasks: TaskRecord[],
	ctx: PoolContext,
): { task: TaskRecord; score: number }[] {
	const docs = tasks.map((t) => new Set(tokens(`${t.title} ${t.title} ${t.summary}`)));
	const df = new Map<string, number>();
	for (const d of docs) for (const tok of d) df.set(tok, (df.get(tok) ?? 0) + 1);
	const idf = (tok: string) => Math.log(1 + tasks.length / (df.get(tok) ?? 1));
	const query = new Set(tokens(`${candidate.title} ${candidate.description}`));

	return tasks
		.map((task, i) => {
			let score = 0;
			for (const tok of query) if (docs[i].has(tok)) score += idf(tok);
			if (score > 0 && sharesContext(task, ctx)) score += 3;
			if (fromMeeting(task, ctx)) score += 5;
			return { task, score };
		})
		.sort((a, b) => b.score - a.score || b.task.lastEdited.localeCompare(a.task.lastEdited));
}

export function selectPool(
	candidate: MatchCandidate,
	tasks: TaskRecord[],
	ctx: PoolContext,
): TaskRecord[] {
	const ranked = rankTasks(candidate, tasks, ctx);
	const open = ranked.filter((r) => r.task.open).slice(0, MAX_OPEN);
	const closed = ranked.filter((r) => !r.task.open && r.score > 0).slice(0, MAX_CLOSED);
	return [...open, ...closed].map((r) => r.task);
}

// ---------------------------------------------------------------------------
// Jev request

export function buildMatchRequest(candidate: MatchCandidate, pool: TaskRecord[]) {
	const state = {
		candidate: {
			title: candidate.title,
			description: candidate.description,
			owner: candidate.owner ?? "(not stated)",
			client_or_project: candidate.client ?? "(internal / not stated)",
		},
	};
	const questions: Record<string, JevQuestion> = {};
	pool.forEach((task, i) => {
		const existing_task = {
			title: task.title,
			summary: task.summary.slice(0, 600) || "(none)",
			assignee: task.assignee ?? "(unassigned)",
		};
		// No meeting-level flags in here: in a meeting that covers two clients,
		// "same client as the meeting" is true of both and misleads Jev. Those
		// only steer which closed tasks reach the pool (rankTasks).
		questions[`t${i}`] = {
			type: "choice",
			instructions: {
				question:
					"`candidate` is a proposed new task from a meeting. How does it relate to `existing_task`?",
				existing_task,
			},
			criteria: RELATIONSHIPS,
		};
		questions[`s${i}`] = {
			...SCOPE_QUESTION,
			instructions: {
				question: "Are `candidate` and `existing_task` for the same client, deal or project?",
				existing_task,
			},
		};
	});
	return { state, questions };
}

// ---------------------------------------------------------------------------
// Decision

export interface TaskMatch {
	taskId: string;
	url: string;
	ticketId: number | null;
	title: string;
	status: string;
	open: boolean;
	assignee: string | null;
	due: string | null;
	lastEdited: string;
	relationship: Exclude<Relationship, "unrelated">;
	/** Probability of `relationship`. */
	probability: number;
	/** Probability of any relationship at all (1 − unrelated). */
	relatedness: number;
	/** Probability the two are for the same client, deal or project. */
	sameScope: number;
}

export type Recommendation =
	| "update_existing"
	| "confirm_duplicate"
	| "check_already_done"
	| "create_as_subtask"
	| "confirm_subtask"
	| "create";

export interface MatchResult {
	ref: string;
	title: string;
	recommendation: Recommendation;
	/** The task the recommendation is about (update target, parent, or done twin). */
	targetTaskId: string | null;
	/** Tasks to put in the new task's `Related to` relation if one is created. */
	relatedTaskIds: string[];
	/** Existing tasks that should become sub-tasks of the new one. */
	childTaskIds: string[];
	explanation: string;
	matches: TaskMatch[];
	comparedOpen: number;
	comparedClosed: number;
}

const round = (p: number) => Math.round(p * 100) / 100;
const label = (m: TaskMatch) =>
	`"${m.title}"${m.ticketId !== null ? ` (#${m.ticketId})` : ""}, ${m.status}`;

export function toMatches(pool: TaskRecord[], answers: Record<string, unknown>): TaskMatch[] {
	const matches: TaskMatch[] = [];
	pool.forEach((task, i) => {
		const probs = choiceProbabilities(answers[`t${i}`]);
		if (!probs) return;
		const relatedness = 1 - (probs.unrelated ?? 0);
		if (relatedness < MIN_MATCH) return;
		const sameScope = noulOf(answers[`s${i}`]);
		if (sameScope === null || sameScope < MIN_SAME_SCOPE) return;
		const [relationship, probability] = (
			Object.entries(probs).filter(([k]) => k !== "unrelated" && k in RELATIONSHIPS) as [
				TaskMatch["relationship"],
				number,
			][]
		).sort((a, b) => b[1] - a[1])[0] ?? ["related", 0];
		if (probability < MIN_MATCH) return;
		matches.push({
			taskId: task.id,
			url: task.url,
			ticketId: task.ticketId,
			title: task.title,
			status: task.status,
			open: task.open,
			assignee: task.assignee,
			due: task.due,
			lastEdited: task.lastEdited,
			relationship,
			probability: round(probability),
			relatedness: round(relatedness),
			sameScope: round(sameScope),
		});
	});
	return matches.sort((a, b) => b.probability - a.probability).slice(0, MAX_MATCHES);
}

/**
 * Precedence: an open duplicate beats everything (update it, don't create);
 * then a closed duplicate (maybe already done — the agent checks dates, which
 * Jev is weak at, e.g. last month's payroll vs this month's); then an open
 * parent (create as its sub-task); otherwise create, linking whatever is related.
 */
export function recommend(
	candidate: MatchCandidate,
	matches: TaskMatch[],
	compared: { open: number; closed: number },
): MatchResult {
	const best = (rel: TaskMatch["relationship"], open: boolean) =>
		matches.find((m) => m.relationship === rel && m.open === open) ?? null;
	const openSame = best("same", true);
	const closedSame = best("same", false);
	const openParent = best("existing_contains_candidate", true);

	const base = {
		ref: candidate.ref,
		title: candidate.title,
		matches,
		comparedOpen: compared.open,
		comparedClosed: compared.closed,
	};
	const linksExcept = (excludeId: string | null) => ({
		relatedTaskIds: matches
			.filter(
				(m) =>
					m.taskId !== excludeId &&
					m.probability >= SURE &&
					(m.relationship === "related" ||
						(!m.open && m.relationship !== "candidate_contains_existing")),
			)
			.map((m) => m.taskId),
		childTaskIds: matches
			.filter(
				(m) =>
					m.taskId !== excludeId &&
					m.open &&
					m.relationship === "candidate_contains_existing" &&
					m.probability >= SURE,
			)
			.map((m) => m.taskId),
	});

	if (openSame && openSame.probability >= SURE) {
		return {
			...base,
			recommendation: "update_existing",
			targetTaskId: openSame.taskId,
			relatedTaskIds: [],
			childTaskIds: [],
			explanation: `Duplicate of open task ${label(openSame)} (p=${openSame.probability}). Update it and link this meeting; don't create a new task.`,
		};
	}
	if (openSame && openSame.probability >= MAYBE) {
		return {
			...base,
			recommendation: "confirm_duplicate",
			targetTaskId: openSame.taskId,
			relatedTaskIds: [],
			childTaskIds: [],
			explanation: `Possibly a duplicate of open task ${label(openSame)} (p=${openSame.probability}). Ask before creating.`,
		};
	}
	if (closedSame && closedSame.probability >= SURE) {
		return {
			...base,
			recommendation: "check_already_done",
			targetTaskId: closedSame.taskId,
			...linksExcept(null),
			explanation: `Same outcome as closed task ${label(closedSame)}, last edited ${closedSame.lastEdited.slice(0, 10)}. If it is the same occurrence, it's already done: don't create. If it's new work (a recurrence or a reopening), create the task and relate it to that one.`,
		};
	}
	if (openParent && openParent.probability >= SURE) {
		return {
			...base,
			recommendation: "create_as_subtask",
			targetTaskId: openParent.taskId,
			...linksExcept(openParent.taskId),
			explanation: `Part of open task ${label(openParent)} (p=${openParent.probability}). Create it with that task as its Parent task.`,
		};
	}
	if (openParent && openParent.probability >= MAYBE) {
		return {
			...base,
			recommendation: "confirm_subtask",
			targetTaskId: openParent.taskId,
			...linksExcept(openParent.taskId),
			explanation: `Possibly part of open task ${label(openParent)} (p=${openParent.probability}). Create it; ask whether to make it a sub-task of that task.`,
		};
	}
	const links = linksExcept(null);
	return {
		...base,
		recommendation: "create",
		targetTaskId: null,
		...links,
		explanation:
			links.relatedTaskIds.length || links.childTaskIds.length
				? "No duplicate. Create it and set the related/sub-task links listed."
				: "No duplicate or close relation. Create it.",
	};
}
