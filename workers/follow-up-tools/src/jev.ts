/**
 * Jev (TypeSafe's typed-judgement model), called directly with the worker's
 * own API key (`TYPESAFE_API_KEY`, from 1Password
 * `op://Private/jev-notion-meeting-note-tasks/credential` in the workFlowers
 * account). Unlike `meeting-note-db-updates`, there is no Zapier relay.
 */
const JEV_URL = "https://api.typesafe.ai/v1/systemone";
// `jev-latest` moves when TypeSafe ships a release; every tool result reports
// the answering model so a behaviour change can be traced to a version.
const JEV_MODEL = "jev-latest";
const MAX_ATTEMPTS = 4;
const RETRYABLE = new Set([429, 500, 502, 503, 529]);

export type JevInstructions = string | Record<string, unknown> | unknown[];

export type JevQuestion =
	| {
			type: "noul";
			instructions: JevInstructions;
			criteria?: { true?: JevInstructions; false?: JevInstructions };
	  }
	| {
			type: "choice";
			instructions: JevInstructions;
			criteria: Record<string, JevInstructions | null>;
	  };

export interface JevResponse {
	model: string;
	answers: Record<string, unknown>;
}

function apiKey(): string {
	const key = process.env.TYPESAFE_API_KEY;
	if (!key) {
		throw new Error(
			"TYPESAFE_API_KEY is not configured. Set it with `ntn workers env set TYPESAFE_API_KEY …`.",
		);
	}
	return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One Jev request. Retries rate limits and overloads with exponential backoff
 * (the API docs ask for exactly this); throws on anything else.
 */
export async function askJev(
	state: unknown,
	questions: Record<string, JevQuestion>,
): Promise<JevResponse> {
	const body = JSON.stringify({ model: JEV_MODEL, state, questions });
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(JEV_URL, {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
			body,
		});
		const text = await res.text();
		if (res.ok) {
			const parsed = JSON.parse(text);
			if (!parsed || typeof parsed.answers !== "object" || parsed.answers === null) {
				throw new Error(`Jev returned no answers: ${text.slice(0, 500)}`);
			}
			return { model: String(parsed.model ?? "?"), answers: parsed.answers };
		}
		if (!RETRYABLE.has(res.status) || attempt >= MAX_ATTEMPTS) {
			throw new Error(`Jev ${res.status}: ${text.slice(0, 500)}`);
		}
		await sleep(500 * 2 ** (attempt - 1));
	}
}

/** A Noul answer's probability of yes, or null when missing or malformed. */
export function noulOf(answer: unknown): number | null {
	const p = (answer as { noul?: unknown } | null | undefined)?.noul;
	return typeof p === "number" && Number.isFinite(p) ? p : null;
}

/** A Choice answer's probabilities, or null when missing or malformed. */
export function choiceProbabilities(answer: unknown): Record<string, number> | null {
	const probs = (answer as { probabilities?: unknown } | null | undefined)?.probabilities;
	if (!probs || typeof probs !== "object") return null;
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(probs)) {
		if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
	}
	return Object.keys(out).length ? out : null;
}
