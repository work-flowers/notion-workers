import { WebhookVerificationError } from "@notionhq/workers";
import {
	createPage,
	DEFAULT_CONTACTS_DATA_SOURCE_ID,
	lookupExistingContacts,
	retrievePage,
	updatePage,
} from "@work-flowers/notion-worker-shared";
import { comment, type Props, relationIds, splitName, status, text } from "./notion.js";
import { stopLeadEverywhere } from "./smartlead.js";

type Event = { deliveryId: string; body: unknown };

/**
 * Notion database automations post `{ source: { type: "automation" }, data: { object: "page", id } }`.
 * Anything else is not ours.
 */
function pageIdOf(body: unknown): string {
	const b = (body ?? {}) as { source?: { type?: string }; data?: { object?: string; id?: string } };
	if (b.data?.object !== "page" || typeof b.data.id !== "string") {
		throw new WebhookVerificationError("Expected a Notion automation payload with data.object = page");
	}
	return b.data.id;
}

/** Handles one automation delivery, so a failure on one lead doesn't stop the batch. */
async function each(events: Event[], label: string, fn: (pageId: string) => Promise<void>): Promise<void> {
	for (const event of events) {
		const pageId = pageIdOf(event.body);
		try {
			await fn(pageId);
		} catch (err) {
			console.log(`[${label} ${event.deliveryId}] ${pageId}: ${(err as Error).message}`);
			await comment(pageId, `Blocked: ${label} failed unexpectedly (${(err as Error).message.slice(0, 300)})`).catch(
				() => {},
			);
		}
	}
}

/**
 * Status → Interested (a human call; never set automatically on a reply).
 * Creates or links the Contact, marks the lead complete in every Smartlead
 * campaign so no further steps send, and leaves a Done comment.
 */
export function promoteToContact(events: Event[]): Promise<void> {
	return each(events, "promote-to-contact", async (pageId) => {
		const props: Props = (await retrievePage(pageId)).properties ?? {};
		if (status(props.Status) !== "Interested") return;

		const email = (props.Email?.email as string | undefined)?.toLowerCase();
		if (!email) {
			await comment(pageId, "Blocked: no Email, so no Contact can be created or matched");
			return;
		}
		const name = text(props.Lead);

		let contactId = (await lookupExistingContacts([email])).get(email);
		const created = !contactId;
		if (!contactId) {
			const { first, last } = splitName(name);
			const linkedin = props["LinkedIn Profile URL"]?.url as string | undefined;
			const page = await createPage({
				parent: { type: "data_source_id", data_source_id: DEFAULT_CONTACTS_DATA_SOURCE_ID },
				properties: {
					Name: { title: [{ text: { content: name || email } }] },
					"First Name": { rich_text: [{ text: { content: first } }] },
					"Last Name": { rich_text: [{ text: { content: last } }] },
					"Primary Email": { email },
					"Job Title": { rich_text: [{ text: { content: text(props.Role) } }] },
					Location: { rich_text: [{ text: { content: text(props.Location) } }] },
					...(linkedin ? { Linkedin: { url: linkedin } } : {}),
					// The API creates the "Outbound" option on first use.
					"Lead Source": { select: { name: "Outbound" } },
				},
			});
			contactId = page.id as string;
		}

		const linked = new Set(relationIds(props.Contacts));
		if (!linked.has(contactId!)) {
			await updatePage(pageId, {
				properties: { Contacts: { relation: [...linked, contactId!].map((id) => ({ id })) } },
			});
		}

		const { completed, paused } = await stopLeadEverywhere(email);
		const plural = (n: number) => `${n} Smartlead campaign${n > 1 ? "s" : ""}`;
		const smartleadNote = [completed && `marked complete in ${plural(completed)}`, paused && `paused in ${plural(paused)}`]
			.filter(Boolean)
			.join(", ");
		await comment(
			pageId,
			`Done: ${created ? "created" : "linked existing"} Contact for ${name || email}; ${smartleadNote || "not in Smartlead"}`,
		);
	});
}
