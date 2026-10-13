import { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";
import { askJev } from "./jev.js";
import {
	buildMatchRequest,
	type MatchResult,
	recommend,
	selectPool,
	toMatches,
} from "./match.js";
import { loadAllTasks, loadMeetingRelationIds, normalizeId } from "./tasks.js";
import { buildValidationRequest, decide } from "./validate.js";

const worker = new Worker();
export default worker;

const MAX_CANDIDATES = 20;
/** The TypeSafe endpoint rate-limits above roughly eight concurrent requests. */
const JEV_CONCURRENCY = 4;

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
	const out: R[] = new Array(items.length);
	let next = 0;
	const run = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
	return out;
}

// ---------------------------------------------------------------------------

const checkScores = j.object({
	concrete: j.number().nullable().describe("A specific, checkable action or deliverable."),
	committed: j.number().nullable().describe("Someone committed or was assigned, not just a suggestion."),
	grounded: j.number().nullable().describe("The evidence supports the title as written."),
	not_done: j.number().nullable().describe("Not already completed during or before the meeting."),
	owner_clear: j.number().nullable().describe("One clear owner."),
	owner_internal: j.number().nullable().describe("The owner is in workFlowers."),
});

worker.tool("validateFollowUps", {
	title: "Validate Meeting Follow-ups",
	description:
		"Check which proposed follow-ups from a meeting count as tasks. Call this once with every " +
		"candidate you extracted, before searching for duplicates. For each candidate pass a short " +
		"title and a VERBATIM quote from the meeting summary or transcript as evidence (never a " +
		"paraphrase: the judgement is made on the quote). Each result has a verdict: 'create' (file " +
		"it), 'needs_owner' (valid, but no clear owner: follow your instructions for unowned tasks), " +
		"'review' (uncertain: report it, " +
		"don't create), or 'reject' (not a task: report the reason). Then pass the 'create' items " +
		"to findTaskMatches.",
	schema: j.object({
		meetingTitle: j.string().describe("Title of the meeting note."),
		workflowersPeople: j
			.array(j.string())
			.describe("Names of the workFlowers team members in the meeting (internal attendees)."),
		externalPeople: j
			.array(j.string())
			.describe("Names of attendees from outside workFlowers. Empty array if none."),
		candidates: j
			.array(
				j.object({
					ref: j.string().describe("Your own label for this candidate, echoed back, e.g. '1'."),
					title: j.string().describe("Proposed task title, starting with a verb."),
					owner: j
						.string()
						.nullable()
						.describe("Who you think will do it, as named in the meeting; null if unclear."),
					evidence: j
						.string()
						.describe(
							"Verbatim quote(s) from the summary or transcript that establish this follow-up.",
						),
				}),
			)
			.describe(`The proposed follow-ups, at most ${MAX_CANDIDATES}.`),
	}),
	outputSchema: j.object({
		success: j.boolean(),
		model: j.string().nullable().describe("The Jev model version that answered."),
		results: j.array(
			j.object({
				ref: j.string(),
				title: j.string(),
				verdict: j.enum("create", "needs_owner", "review", "reject"),
				reasons: j.array(j.string()).describe("Why it isn't 'create'. Empty when it is."),
				checks: checkScores.describe("Probability that each check passes (0–1)."),
			}),
		),
		message: j.string(),
	}),
	execute: async (input) => {
		const candidates = input.candidates.slice(0, MAX_CANDIDATES);
		if (!candidates.length) {
			return { success: true, model: null, results: [], message: "No candidates to validate." };
		}
		try {
			const { state, questions } = buildValidationRequest(
				{
					title: input.meetingTitle,
					workflowersPeople: input.workflowersPeople,
					externalPeople: input.externalPeople,
				},
				candidates,
			);
			const res = await askJev(state, questions);
			const results = candidates.map((c, i) => decide(c, i, res.answers));
			const count = (v: string) => results.filter((r) => r.verdict === v).length;
			const dropped = input.candidates.length - candidates.length;
			return {
				success: true,
				model: res.model,
				results,
				message:
					`${count("create")} to create, ${count("needs_owner")} need an owner, ` +
					`${count("review")} uncertain, ${count("reject")} rejected.` +
					(dropped ? ` ${dropped} candidate(s) over the limit of ${MAX_CANDIDATES} were not checked.` : ""),
			};
		} catch (err) {
			return {
				success: false,
				model: null,
				results: [],
				message: `Validation failed: ${errorMessage(err)}`,
			};
		}
	},
});

// ---------------------------------------------------------------------------

const matchSchema = j.object({
	taskId: j.string(),
	url: j.string(),
	ticketId: j.number().nullable(),
	title: j.string(),
	status: j.string(),
	open: j.boolean(),
	assignee: j.string().nullable(),
	due: j.string().nullable(),
	lastEdited: j.string(),
	relationship: j.enum("same", "existing_contains_candidate", "candidate_contains_existing", "related"),
	probability: j.number(),
	relatedness: j.number(),
	sameScope: j.number().describe("Probability it's for the same client, deal or project."),
});

worker.tool("findTaskMatches", {
	title: "Find Matching Tasks",
	description:
		"Compare validated follow-ups with the Tasks database (open and closed tasks) and say, for " +
		"each, whether to update an existing task, create it as a sub-task, or create it with links. " +
		"Call after validateFollowUps, with only the candidates whose verdict was 'create' (or " +
		"'needs_owner', with the owner you'll assign). Follow each recommendation: " +
		"'update_existing' → update targetTaskId and link the meeting, don't create; " +
		"'confirm_duplicate' / 'confirm_subtask' → ask the user; " +
		"'check_already_done' → compare dates with the closed targetTaskId and skip if it's the same " +
		"occurrence; 'create_as_subtask' → create with Parent task = targetTaskId; " +
		"'create' → create. When creating, set Related to = relatedTaskIds and make childTaskIds " +
		"sub-tasks of the new task.",
	schema: j.object({
		meetingNoteId: j
			.string()
			.nullable()
			.describe("The meeting note's page id or URL. Used to spot tasks from the same meeting or client."),
		candidates: j
			.array(
				j.object({
					ref: j.string().describe("Your own label, echoed back."),
					title: j.string().describe("Task title."),
					description: j.string().describe("One or two sentences: what will be done, for whom, and why."),
					owner: j.string().nullable().describe("Assignee name, or null."),
					client: j
						.string()
						.nullable()
						.describe(
							"The client, prospect or project it's for, by name (e.g. 'MRT', 'NUS enablement'). Null only for internal admin. Matching depends on this.",
						),
				}),
			)
			.describe(`Validated follow-ups, at most ${MAX_CANDIDATES}.`),
	}),
	outputSchema: j.object({
		success: j.boolean(),
		model: j.string().nullable(),
		results: j.array(
			j.object({
				ref: j.string(),
				title: j.string(),
				recommendation: j.enum(
					"update_existing",
					"confirm_duplicate",
					"check_already_done",
					"create_as_subtask",
					"confirm_subtask",
					"create",
				),
				targetTaskId: j.string().nullable(),
				relatedTaskIds: j.array(j.string()),
				childTaskIds: j.array(j.string()),
				explanation: j.string(),
				matches: j.array(matchSchema),
				comparedOpen: j.number(),
				comparedClosed: j.number(),
			}),
		),
		message: j.string(),
	}),
	execute: async (input) => {
		const candidates = input.candidates.slice(0, MAX_CANDIDATES);
		if (!candidates.length) {
			return { success: true, model: null, results: [], message: "No candidates to match." };
		}
		try {
			const meetingNoteId = input.meetingNoteId ? normalizeId(input.meetingNoteId) : null;
			let meetingWarning = "";
			const [tasks, meetingRelationIds] = await Promise.all([
				loadAllTasks(),
				// Best-effort: the meeting only boosts and labels matches, so a page the
				// agent can't read degrades ranking rather than failing the tool.
				meetingNoteId
					? loadMeetingRelationIds(meetingNoteId).catch((err) => {
							meetingWarning = ` Couldn't read the meeting note (${errorMessage(err)}), so matches ignore it.`;
							return new Set<string>();
						})
					: Promise.resolve(new Set<string>()),
			]);
			const ctx = { meetingNoteId, meetingRelationIds };

			let model: string | null = null;
			const results: MatchResult[] = await mapLimited(candidates, JEV_CONCURRENCY, async (c) => {
				const pool = selectPool(c, tasks, ctx);
				const compared = {
					open: pool.filter((t) => t.open).length,
					closed: pool.filter((t) => !t.open).length,
				};
				if (!pool.length) return recommend(c, [], compared);
				const { state, questions } = buildMatchRequest(c, pool);
				const res = await askJev(state, questions);
				model = res.model;
				return recommend(c, toMatches(pool, res.answers), compared);
			});

			const creates = results.filter((r) => r.recommendation.startsWith("create")).length;
			return {
				success: true,
				model,
				results,
				message: `Compared ${candidates.length} candidate(s) with ${tasks.length} tasks: ${creates} to create, ${results.length - creates} to update, confirm or check.${meetingWarning}`,
			};
		} catch (err) {
			return {
				success: false,
				model: null,
				results: [],
				message: `Matching failed: ${errorMessage(err)}`,
			};
		}
	},
});
