import type { Client } from "@notionhq/client";
import type { createZapierSdk } from "@zapier/zapier-sdk";
import {
	buildInternalUserMap,
	resolveContactPageIds,
	resolveInternalUserIds,
	updatePage,
} from "@work-flowers/notion-worker-shared";
import { parseMailMetadata, waitForMailPageText } from "./mailBlock.js";

type Zapier = ReturnType<typeof createZapierSdk>;

interface AutomationPayload {
	pageId?: string;
	page_id?: string;
	data?: { id?: string };
	source?: { id?: string };
	[k: string]: unknown;
}

function extractPageId(body: unknown): string | null {
	if (!body || typeof body !== "object") return null;
	const b = body as AutomationPayload;
	return b.pageId ?? b.page_id ?? b.data?.id ?? b.source?.id ?? null;
}

export async function handlePageCreated(
	body: unknown,
	{ notion, zapier }: { notion: Client; zapier: Zapier },
): Promise<void> {
	const pageId = extractPageId(body);
	if (!pageId) {
		console.log("No pageId in webhook payload; skipping.", body);
		return;
	}

	console.log(`Processing Email page ${pageId}`);

	const pageText = await waitForMailPageText(zapier, pageId);
	if (!pageText) {
		console.log(`No mail block found on ${pageId}; skipping.`);
		return;
	}

	const meta = parseMailMetadata(pageText);
	if (!meta) {
		console.log(`Mail block on ${pageId} could not be parsed; skipping.`);
		return;
	}
	console.log(
		`Parsed mail: from=${meta.from} to=${meta.to.length} cc=${meta.cc.length} messageId=${meta.messageId}`,
	);

	const allEmails = [meta.from, ...meta.to, ...meta.cc].filter(Boolean);

	const [internalMap, resolvedContactIds] = await Promise.all([
		buildInternalUserMap(notion),
		resolveContactPageIds(notion, zapier, allEmails),
	]);
	const internalUserIds = resolveInternalUserIds(allEmails, internalMap);

	const properties: Record<string, any> = {};

	if (meta.from) {
		properties["From"] = { email: meta.from };
	}
	if (meta.to.length > 0) {
		properties["To"] = {
			multi_select: meta.to.map((name) => ({ name })),
		};
	}
	if (meta.cc.length > 0) {
		properties["Cc"] = {
			multi_select: meta.cc.map((name) => ({ name })),
		};
	}
	// Notion sets Date Received itself on most pages; only fill it in when it
	// was missing and a date could be parsed from the mail headers.
	if (meta.timestamp && !meta.dateFromProperties) {
		properties["Date Received"] = { date: { start: meta.timestamp } };
	}
	if (meta.messageId) {
		properties["Gmail Message ID"] = {
			rich_text: [{ type: "text", text: { content: meta.messageId } }],
		};
	}
	const threadId = meta.threadId || meta.messageId;
	if (threadId) {
		properties["Gmail Thread ID"] = {
			rich_text: [{ type: "text", text: { content: threadId } }],
		};
	}

	// Merge with relations Notion may have set natively so we never drop them.
	const mergedContactIds = [
		...new Set([...meta.existingContactIds, ...resolvedContactIds]),
	];
	if (mergedContactIds.length > 0) {
		properties["Contacts"] = {
			relation: mergedContactIds.map((id) => ({ id })),
		};
	}

	if (internalUserIds.length > 0) {
		properties["Internal Recipients"] = {
			people: internalUserIds.map((id) => ({ id })),
		};
		properties["Comment Access"] = {
			people: internalUserIds.map((id) => ({ id })),
		};
	}

	// Silent: setting Internal Recipients would otherwise notify every recipient.
	await updatePage(pageId, { properties });
	console.log(
		`Updated ${pageId}: contacts=${mergedContactIds.length} (existing=${meta.existingContactIds.length}, resolved=${resolvedContactIds.length}), internal=${internalUserIds.length}`,
	);
}
