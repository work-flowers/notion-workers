/**
 * Notion Worker: Marketplace Downloads
 *
 * Receives Notion Marketplace seller webhooks (marketplace.purchase and
 * marketplace.refund) and records each acquisition as one row in the
 * Marketplace Downloads database, keyed by acquisitionId:
 *
 *   - purchase: creates the row (Status Acquired). A retry of the same
 *     acquisitionId is skipped.
 *   - refund: marks the existing row Refunded with the refund time and reason,
 *     or creates a Refunded row if the purchase was never captured.
 *
 * The raw payload is kept in the page body as a JSON code block.
 *
 * The Marketplace doesn't sign its webhooks, so the unique webhook URL is the
 * only secret. Bodies that aren't Marketplace events (e.g. the creator
 * profile's Test button, whose payload is undocumented) are logged and
 * skipped rather than rejected, so they never count towards the platform's
 * five-invalid-payloads short circuit.
 *
 * Auth: webhook handlers are NOT auto-authenticated, so set a token first:
 *   ntn workers env set NOTION_API_TOKEN=ntn_...
 */

import { Worker } from "@notionhq/workers";
import {
	createPage,
	queryDataSource,
	updatePage,
} from "@work-flowers/notion-worker-shared";
import {
	newRowProperties,
	parseMarketplaceEvent,
	refundProperties,
	type MarketplaceEvent,
} from "./payload.js";

/** Marketplace Downloads data source (Company Home). */
const DOWNLOADS_DATA_SOURCE_ID = "cc62edf4-080d-419f-ba03-3065168763f3";

const worker = new Worker();
export default worker;

async function findRow(acquisitionId: string): Promise<any | null> {
	const res = await queryDataSource(DOWNLOADS_DATA_SOURCE_ID, {
		filter: { property: "Acquisition ID", rich_text: { equals: acquisitionId } },
		page_size: 1,
	});
	return res.results[0] ?? null;
}

async function createRow(e: MarketplaceEvent, rawBody: unknown): Promise<void> {
	const page = await createPage({
		parent: { type: "data_source_id", data_source_id: DOWNLOADS_DATA_SOURCE_ID },
		properties: newRowProperties(e),
		markdown: `## Webhook payload\n\n\`\`\`json\n${JSON.stringify(rawBody, null, 2)}\n\`\`\`\n`,
	});
	console.log(`Created ${e.type} row ${page.id} for ${e.acquisitionId}`);
}

async function handle(e: MarketplaceEvent, rawBody: unknown): Promise<void> {
	const existing = await findRow(e.acquisitionId);

	if (e.type === "marketplace.purchase") {
		if (existing) {
			console.log(`Purchase ${e.acquisitionId} already recorded (${existing.id}); skipping`);
			return;
		}
		await createRow(e, rawBody);
		return;
	}

	if (!existing) {
		await createRow(e, rawBody);
		return;
	}
	await updatePage(existing.id, { properties: refundProperties(e) });
	console.log(`Marked ${e.acquisitionId} refunded (${existing.id})`);
}

worker.webhook("onMarketplaceEvent", {
	title: "Marketplace Event",
	description:
		"Records Notion Marketplace template purchases, free downloads and refunds in the Marketplace Downloads database. Register the URL as the Webhook URL in the creator profile.",
	execute: async (events) => {
		for (const event of events) {
			const parsed = parseMarketplaceEvent(event.body);
			if (!parsed) {
				console.log(
					`Ignoring non-Marketplace payload (delivery ${event.deliveryId}): ${event.rawBody.slice(0, 500)}`,
				);
				continue;
			}
			await handle(parsed, event.body);
		}
	},
});
