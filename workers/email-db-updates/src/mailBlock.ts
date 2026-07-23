import type { createZapierSdk } from "@zapier/zapier-sdk";

type Zapier = ReturnType<typeof createZapierSdk>;

// Mail blocks are not exposed by the public Notion API, so the page is
// fetched through Notion MCP via the "MCP Client by Zapier" app — the same
// route the original Zap used.
const MCP_CLIENT_APP_KEY = "App222157CLIAPI";
const MCP_FETCH_TOOL = "notion-fetch";

const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 90_000;

export interface MailMetadata {
	from: string;
	to: string[];
	cc: string[];
	subject: string;
	/** ISO timestamp when parseable, otherwise "". */
	timestamp: string;
	/** True when the timestamp came from the page's own Date Received property. */
	dateFromProperties: boolean;
	messageId: string;
	threadId: string;
	/** Contact page ids already related to the page (set natively by Notion). */
	existingContactIds: string[];
}

const EMAIL_REGEX = /[\w.+-]+@[\w.-]+\.\w+/g;

let cachedConnectionId: string | number | null = null;

async function getMcpConnectionId(zapier: Zapier): Promise<string | number> {
	if (cachedConnectionId !== null) return cachedConnectionId;
	const override = process.env.MCP_CLIENT_CONNECTION_ID;
	if (override) {
		cachedConnectionId = override;
		return override;
	}
	// Multiple MCP Client connections may exist (one per MCP server/version);
	// prefer the newest app version. Set MCP_CLIENT_CONNECTION_ID to pin one.
	const { data } = await (zapier as any).listConnections({ owner: "me" });
	const candidates = ((data ?? []) as any[])
		.filter((c) => c.app_key === MCP_CLIENT_APP_KEY)
		.sort((a, b) =>
			String(b.app_version ?? "").localeCompare(
				String(a.app_version ?? ""),
				undefined,
				{ numeric: true },
			),
		);
	const chosen = candidates[0];
	if (!chosen?.id) {
		throw new Error(
			"No MCP Client by Zapier connection found; set MCP_CLIENT_CONNECTION_ID.",
		);
	}
	console.log(
		`Using MCP Client connection ${chosen.id} (${chosen.title ?? "untitled"})`,
	);
	cachedConnectionId = chosen.id;
	return chosen.id;
}

/**
 * Depth-first search of an arbitrary runAction result for the enhanced-
 * markdown page text (the string containing the <page>/<mail> markup).
 */
function findPageText(value: unknown, depth = 0): string | null {
	if (depth > 6 || value == null) return null;
	if (typeof value === "string") {
		if (value.includes("<mail>") || value.includes("<page ")) {
			// The MCP tool may return the full JSON envelope as a string.
			try {
				const parsed = JSON.parse(value);
				return findPageText(parsed, depth + 1) ?? value;
			} catch {
				return value;
			}
		}
		return null;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findPageText(item, depth + 1);
			if (found) return found;
		}
		return null;
	}
	if (typeof value === "object") {
		for (const item of Object.values(value)) {
			const found = findPageText(item, depth + 1);
			if (found) return found;
		}
	}
	return null;
}

async function fetchPageText(
	zapier: Zapier,
	pageId: string,
): Promise<string | null> {
	const connectionId = await getMcpConnectionId(zapier);
	const { data } = await zapier.runAction({
		appKey: MCP_CLIENT_APP_KEY,
		actionType: "write",
		actionKey: "call_tool_as_create",
		connectionId,
		inputs: {
			_tool_name: MCP_FETCH_TOOL,
			_tool_error: true,
			_tool_parse: true,
			id: pageId,
			include_transcript: false,
			include_discussions: false,
		},
	} as any);
	return findPageText(data);
}

/**
 * Poll the page via Notion MCP until its <mail> block is present, up to
 * ~90s (the block is populated asynchronously after page creation).
 */
export async function waitForMailPageText(
	zapier: Zapier,
	pageId: string,
): Promise<string | null> {
	const deadline = Date.now() + MAX_WAIT_MS;
	for (;;) {
		const text = await fetchPageText(zapier, pageId);
		if (text && /<mail>[\s\S]*?<\/mail>/.test(text)) return text;
		if (Date.now() + POLL_INTERVAL_MS > deadline) return null;
		await sleep(POLL_INTERVAL_MS);
	}
}

function extractField(body: string, fieldName: string): string {
	// Headers sit at the start of the block or immediately after a <br>;
	// requiring that boundary avoids matching "Cc:"/"To:" fragments buried
	// inside quoted reply chains or signatures.
	const regex = new RegExp(
		"(?:^|<br>)\\s*" + fieldName + ":\\s*(.+?)\\s*(?:<br>|$)",
		"i",
	);
	const match = body.match(regex);
	return match ? match[1].trim() : "";
}

function extractEmails(str: string): string[] {
	return (str.match(EMAIL_REGEX) || []).map((s) => s.toLowerCase());
}

function pageUrlToUuid(url: string): string | null {
	const m = url.match(/([0-9a-f]{32})\s*$/i);
	if (!m) return null;
	const h = m[1].toLowerCase();
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Parse email metadata out of the enhanced-markdown page text. Ported from
 * the original Zap's Code step: messages inside <mail> are delimited by
 * "---" separators (latest first); Gmail Thread ID and Date Received come
 * from the <properties> JSON outside the <mail> block.
 */
export function parseMailMetadata(text: string): MailMetadata | null {
	const mailMatch = text.match(/<mail>([\s\S]*?)<\/mail>/);
	if (!mailMatch) return null;
	const mailBody = mailMatch[1];

	const messages = mailBody
		.split(/(?:<br>|\s)*-{3,}(?:<br>|\s)*/)
		.map((s) => s.trim())
		.filter(Boolean);
	const latest = messages[0] || mailBody;

	const fromRaw = extractField(latest, "From");
	const toRaw = extractField(latest, "To");
	const ccRaw = extractField(latest, "Cc");
	const subject = extractField(latest, "Subject");
	const messageId = extractField(latest, "MessageId");

	let threadId = "";
	let dateRaw = "";
	let existingContactIds: string[] = [];
	const propsMatch = text.match(/<properties>\s*([\s\S]*?)\s*<\/properties>/);
	if (propsMatch) {
		try {
			const props = JSON.parse(propsMatch[1]);
			threadId = props["Gmail Thread ID"] || "";
			dateRaw = props["date:Date Received:start"] || "";
			if (Array.isArray(props["Contacts"])) {
				existingContactIds = props["Contacts"]
					.map((url: unknown) => pageUrlToUuid(String(url)))
					.filter((id: string | null): id is string => Boolean(id));
			}
		} catch {
			// fall through to header-based date parsing
		}
	}
	const dateFromProperties = Boolean(dateRaw);
	if (!dateRaw) {
		dateRaw =
			extractField(latest, "Date") ||
			extractField(latest, "Sent") ||
			extractField(latest, "Timestamp");
	}

	let timestamp = "";
	if (dateRaw) {
		const parsed = new Date(dateRaw);
		if (!Number.isNaN(parsed.getTime())) timestamp = parsed.toISOString();
	}

	return {
		from: extractEmails(fromRaw)[0] ?? "",
		to: extractEmails(toRaw),
		cc: extractEmails(ccRaw),
		subject,
		timestamp,
		dateFromProperties,
		messageId,
		threadId,
		existingContactIds,
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
