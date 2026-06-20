import { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";
import { createZapierSdk } from "@zapier/zapier-sdk";

const worker = new Worker();
export default worker;

const BUTTONDOWN_APP = "buttondown";

/**
 * Lazily-initialised Zapier SDK client, authenticated with client credentials.
 *
 * A Worker runs headless in Notion's sandbox, so there is no browser for the
 * usual OAuth login. We authenticate with client credentials generated via
 * `npx zapier-sdk create-client-credentials` and stored as Worker secrets.
 */
type Zapier = ReturnType<typeof createZapierSdk>;
let sdk: Zapier | undefined;

function getZapier(): Zapier {
	const clientId = process.env.ZAPIER_CLIENT_ID;
	const clientSecret = process.env.ZAPIER_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new Error(
			"Zapier client credentials are not configured. Set ZAPIER_CLIENT_ID and ZAPIER_CLIENT_SECRET as Worker secrets.",
		);
	}
	sdk ??= createZapierSdk({ credentials: { clientId, clientSecret } });
	return sdk;
}

/**
 * Resolve the Buttondown connection id once and cache it. An explicit
 * BUTTONDOWN_CONNECTION_ID secret takes precedence; otherwise we look up the
 * first non-expired Buttondown connection on the account.
 */
let connectionIdPromise: Promise<string> | undefined;

function resolveButtondownConnectionId(zapier: Zapier): Promise<string> {
	const override = process.env.BUTTONDOWN_CONNECTION_ID;
	if (override) return Promise.resolve(override);

	const pending =
		connectionIdPromise ??
		zapier
			.findFirstConnection({ app: BUTTONDOWN_APP, owner: "me" })
			.then((res: { data?: { id?: string } }) => {
				const id = res.data?.id;
				if (!id) {
					throw new Error(
						"No Buttondown connection found in Zapier. Connect Buttondown at https://zapier.com/app/connections.",
					);
				}
				return id;
			})
			.catch((err: unknown) => {
				// Don't cache failures — allow the next call to retry.
				connectionIdPromise = undefined;
				throw err;
			});

	connectionIdPromise = pending;
	return pending;
}

worker.tool("createSubscriber", {
	title: "Create Buttondown Subscriber",
	description:
		"Add a new subscriber to the Buttondown newsletter by email address. " +
		"Use when the user wants to subscribe, sign up, or add someone to the mailing list. " +
		"By default this merges with any existing subscriber of the same email rather than failing, " +
		"and does NOT auto-activate — subscribers go through Buttondown's normal opt-in. " +
		"Only set automaticallyActivate when the person has clearly consented to receive emails.",
	schema: j.object({
		email: j.email().describe("The subscriber's email address."),
		notes: j
			.string()
			.describe("Internal notes about this subscriber (not shown to the subscriber).")
			.nullable(),
		tags: j
			.array(j.string())
			.describe("Tags to apply to the subscriber, e.g. [\"newsletter\", \"vip\"].")
			.nullable(),
		metadata: j
			.array(
				j.object({
					key: j.string().describe("Metadata field name."),
					value: j.string().describe("Metadata field value."),
				}),
			)
			.describe("Arbitrary key/value metadata to store on the subscriber.")
			.nullable(),
		merge: j
			.boolean()
			.describe(
				"If true (default), update the existing subscriber when the email already exists instead of failing.",
			)
			.nullable(),
		automaticallyActivate: j
			.boolean()
			.describe(
				"If true, mark the subscriber active immediately, skipping Buttondown's opt-in confirmation. " +
					"Defaults to false. Only use when consent is already established.",
			)
			.nullable(),
	}),
	outputSchema: j.object({
		success: j.boolean().describe("Whether the subscriber was created or updated."),
		email: j.string().describe("The email address that was processed."),
		subscriberId: j.string().describe("The Buttondown subscriber id, if returned.").nullable(),
		status: j
			.string()
			.describe("Buttondown subscriber status, e.g. 'unactivated', 'regular'.")
			.nullable(),
		message: j.string().describe("Human-readable result or error description."),
	}),
	execute: async (input) => {
		const { email } = input;
		const merge = input.merge ?? true;
		const automaticallyActivate = input.automaticallyActivate ?? false;

		// Build the Zapier action inputs, omitting empty optionals.
		const inputs: Record<string, unknown> = {
			email,
			merge,
			automatically_activate: automaticallyActivate,
		};
		if (input.notes) inputs.notes = input.notes;
		if (input.tags && input.tags.length > 0) inputs.tag = input.tags;
		if (input.metadata && input.metadata.length > 0) {
			inputs.metadata = Object.fromEntries(
				input.metadata.map(({ key, value }) => [key, value]),
			);
		}

		try {
			const zapier = getZapier();
			const connection = await resolveButtondownConnectionId(zapier);

			const { data } = await zapier.runAction({
				app: BUTTONDOWN_APP,
				actionType: "write",
				action: "subscriber",
				connection,
				inputs,
			});

			// Zapier returns write results as an array; the subscriber is the first item.
			const first = Array.isArray(data) ? data[0] : data;
			const record = (first ?? {}) as Record<string, unknown>;
			const subscriberId =
				typeof record.id === "string"
					? record.id
					: record.id != null
						? String(record.id)
						: null;
			const status =
				typeof record.subscriber_type === "string" ? record.subscriber_type : null;

			return {
				success: true,
				email,
				subscriberId,
				status,
				message:
					`Subscriber ${email} ${merge ? "created or updated" : "created"} in Buttondown` +
					(status ? ` (status: ${status}).` : "."),
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				success: false,
				email,
				subscriberId: null,
				status: null,
				message: `Failed to create subscriber ${email}: ${message}`,
			};
		}
	},
});
