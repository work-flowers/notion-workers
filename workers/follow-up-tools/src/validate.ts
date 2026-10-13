import { type JevQuestion, noulOf } from "./jev.js";

/**
 * Jev call 1: does each proposed follow-up count as a task?
 *
 * The agent extracts candidates from the meeting; Jev scores each against the
 * Meeting Follow-up Tasks agent's "what counts as a follow-up" test, one Noul
 * per criterion, and the rule that combines them lives here in code. Splitting
 * the test into separate literal questions (rather than one "is this a valid
 * task?") is deliberate: Jev reads instructions literally, and a per-criterion
 * probability tells the agent *why* a candidate failed.
 *
 * Every candidate carries a verbatim evidence quote. The questions are about the
 * quote, not the agent's title, so a paraphrase that hardens "Lou to consider a
 * video" into "Create video" can't launder a suggestion into a commitment — and
 * the `grounded` check catches the title doing exactly that.
 */

export interface MeetingInput {
	title: string;
	workflowersPeople: string[];
	externalPeople: string[];
}

export interface FollowUpCandidate {
	ref: string;
	title: string;
	owner: string | null;
	evidence: string;
}

/**
 * Probabilities are of the check *passing* (for `not_done` and `grounded`, Jev
 * is asked the failure condition and the value is inverted). A check at or
 * above PASS passes; at or below FAIL it fails; anything between needs a human.
 * Starting values, not fitted: tune them against real runs (see CLAUDE.md).
 */
export const PASS = 0.7;
export const FAIL = 0.3;

const HARD_CHECKS = ["concrete", "committed", "grounded", "not_done", "owner_internal"] as const;
type HardCheck = (typeof HARD_CHECKS)[number];
type Check = HardCheck | "owner_clear";

/** Asked as the failure condition ("already done?", "overclaims?"); inverted to P(pass). */
const INVERTED = new Set<Check>(["not_done", "grounded"]);

/** Shown to the agent when a check fails or is uncertain. */
const FAILURE_REASON: Record<Check, string> = {
	concrete: "not a concrete, checkable action (a theme, goal, habit or topic)",
	committed: "no commitment or assignment: reads as a suggestion or idea",
	grounded: "the title claims more than the evidence says (commitment, scope, owner or deadline)",
	not_done: "already done during or before the meeting",
	owner_internal: "owned by someone outside workFlowers",
	owner_clear: "no single clear owner",
};

function questionsFor(id: string): Record<Check, JevQuestion> {
	const c = `candidates.${id}`;
	return {
		concrete: {
			type: "noul",
			instructions: `Does \`${c}.evidence\` describe a specific action or deliverable, such as sending, preparing, scheduling, setting up, reviewing, fixing or deciding a named thing, whose completion someone could check?`,
			criteria: {
				true: "A specific action or deliverable that is either done or not done.",
				false:
					"A theme, aspiration, habit, ongoing responsibility, general goal or discussion topic with no specific action, e.g. 'get better at marketing' or 'keep improving onboarding'.",
			},
		},
		committed: {
			type: "noul",
			instructions: `In \`${c}.evidence\`, did a person agree, commit, get assigned, or get directly asked to do the action?`,
			criteria: {
				true: "A commitment, assignment or agreed next step, e.g. 'X will send…', 'X agreed to…', 'X to prepare…', a direct request that was accepted, or an action item stated as an instruction ('Prepare the questions for the next call'), even if nobody is named.",
				false:
					"Only a suggestion, idea or possibility, using words like consider, maybe, could, should, might, explore, think about, look into, interested in, or it would be good to, even when it appears under an 'Action items' heading.",
			},
		},
		// Asked the negative way round and inverted in decide(): the positive
		// phrasing ("does the evidence support the title?") marked titles down
		// for *omitting* detail — dropping "once more information is gathered".
		grounded: {
			type: "noul",
			instructions: `Does \`${c}.title\` state a commitment, owner, deadline or scope that \`${c}.evidence\` does not support?`,
			criteria: {
				true: "The title adds something the evidence doesn't say, e.g. turns a suggestion into a commitment, names a different owner, or adds a deadline.",
				false: "Everything the title says is in the evidence. A title that is shorter or leaves out details is fine.",
			},
		},
		not_done: {
			type: "noul",
			instructions: `Does \`${c}.evidence\` say the action was already completed during or before the meeting?`,
		},
		owner_clear: {
			type: "noul",
			instructions: `Does \`${c}.evidence\` make clear which one person will do the action?`,
			criteria: {
				true: "A named person, or an unambiguous speaker who said they would do it.",
				false: "Nobody, 'we', 'someone', 'the team', or several people with no one responsible.",
			},
		},
		owner_internal: {
			type: "noul",
			instructions: `Is the person who will do the action in \`${c}.evidence\` one of \`meeting.workflowers_people\`?`,
			criteria: {
				true: "The action is done by a member of workFlowers listed in `meeting.workflowers_people`.",
				false:
					"The action is done by a client, prospect, vendor, partner or anyone else outside workFlowers, such as someone in `meeting.external_people`.",
			},
		},
	};
}

/** Jev-safe ids: the agent's refs can be anything, so key questions by position. */
const idOf = (i: number) => `c${i + 1}`;

export function buildValidationRequest(meeting: MeetingInput, candidates: FollowUpCandidate[]) {
	const state = {
		meeting: {
			title: meeting.title,
			workflowers_people: meeting.workflowersPeople,
			external_people: meeting.externalPeople.length ? meeting.externalPeople : "(none listed)",
		},
		candidates: Object.fromEntries(
			candidates.map((c, i) => [
				idOf(i),
				{ title: c.title, owner: c.owner ?? "(not stated)", evidence: c.evidence },
			]),
		),
	};
	const questions: Record<string, JevQuestion> = {};
	candidates.forEach((_, i) => {
		for (const [check, q] of Object.entries(questionsFor(idOf(i)))) {
			questions[`${idOf(i)}__${check}`] = q;
		}
	});
	return { state, questions };
}

export type Verdict = "create" | "needs_owner" | "review" | "reject";

export interface ValidationResult {
	ref: string;
	title: string;
	verdict: Verdict;
	reasons: string[];
	/** Probability each check passes; null when Jev returned no usable answer. */
	checks: Record<Check, number | null>;
}

const round = (p: number) => Math.round(p * 100) / 100;

/**
 * Combine the per-check probabilities into a verdict. Precedence:
 * reject (a hard check clearly fails) > review (one is uncertain or missing)
 * > needs_owner (passes, but nobody clearly owns it) > create.
 *
 * `owner_internal` is only meaningful once there *is* a clear owner; when
 * `owner_clear` fails its answer is ignored rather than allowed to reject.
 */
export function decide(
	candidate: FollowUpCandidate,
	index: number,
	answers: Record<string, unknown>,
): ValidationResult {
	const id = idOf(index);
	const raw = (check: Check) => noulOf(answers[`${id}__${check}`]);
	const checks = {} as Record<Check, number | null>;
	for (const check of [...HARD_CHECKS, "owner_clear"] as Check[]) {
		const p = raw(check);
		checks[check] = p === null ? null : round(INVERTED.has(check) ? 1 - p : p);
	}

	const ownerClear = checks.owner_clear;
	const ownerUnclear = ownerClear !== null && ownerClear <= FAIL;
	const hard = HARD_CHECKS.filter((c) => !(c === "owner_internal" && ownerUnclear));

	const failed = hard.filter((c) => checks[c] !== null && (checks[c] as number) <= FAIL);
	const uncertain = hard.filter((c) => checks[c] === null || (checks[c] as number) < PASS);
	const ownerUncertain = ownerClear === null || ownerClear < PASS;

	const describe = (c: Check) =>
		`${FAILURE_REASON[c]} (${checks[c] === null ? "no answer" : `p=${checks[c]}`})`;

	let verdict: Verdict;
	let reasons: string[];
	if (failed.length) {
		verdict = "reject";
		reasons = failed.map(describe);
	} else if (uncertain.length) {
		verdict = "review";
		reasons = uncertain.map((c) => `uncertain: ${describe(c)}`);
	} else if (ownerUncertain) {
		verdict = "needs_owner";
		reasons = [describe("owner_clear")];
	} else {
		verdict = "create";
		reasons = [];
	}
	return { ref: candidate.ref, title: candidate.title, verdict, reasons, checks };
}
