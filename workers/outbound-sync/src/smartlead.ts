const BASE = "https://server.smartlead.ai/api/v1";

function apiKey(): string {
	const key = process.env.SMARTLEAD_API_KEY;
	if (!key) throw new Error("SMARTLEAD_API_KEY must be set");
	return key;
}

async function call<T>(method: string, path: string, query: Record<string, string> = {}, body?: unknown): Promise<T> {
	const url = new URL(`${BASE}/${path}`);
	for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
	url.searchParams.set("api_key", apiKey());
	const res = await fetch(url, {
		method,
		headers: body === undefined ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		// Never echo the URL: it carries the API key.
		throw new Error(`Smartlead ${method} /${path} failed: ${res.status} ${text.slice(0, 200)}`);
	}
	return (await res.json()) as T;
}

export type Campaign = { id: number; name: string; status: string; created_at?: string };

export type CampaignAnalytics = {
	sent_count?: string;
	unique_sent_count?: string;
	open_count?: string;
	reply_count?: string;
	bounce_count?: string;
	unsubscribed_count?: string;
	campaign_lead_stats?: { total?: number };
};

export type CampaignLead = {
	status: string;
	lead_category_id: number | null;
	lead: {
		id: number;
		email: string;
		is_unsubscribed?: boolean;
		custom_fields?: Record<string, string | null> | null;
	};
};

/** One message in a lead's thread. Field names vary between docs and live API, so both are read. */
export type HistoryMessage = {
	type?: string;
	direction?: string;
	time?: string;
	sent_at?: string;
	received_at?: string;
	email_body?: string;
	body?: string;
};

export const LEADS_PAGE = 25;

export function listCampaigns(): Promise<Campaign[]> {
	return call<Campaign[]>("GET", "campaigns/");
}

export function campaignAnalytics(id: number): Promise<CampaignAnalytics> {
	return call<CampaignAnalytics>("GET", `campaigns/${id}/analytics`);
}

/** Leads in a campaign, optionally only those with activity (sent or reply) after `eventTimeGt`. */
export async function campaignLeads(
	id: number,
	offset: number,
	opts: { eventTimeGt?: string; emailStatus?: string; limit?: number } = {},
): Promise<CampaignLead[]> {
	const query: Record<string, string> = { offset: String(offset), limit: String(opts.limit ?? LEADS_PAGE) };
	if (opts.eventTimeGt) query.event_time_gt = opts.eventTimeGt;
	if (opts.emailStatus) query.emailStatus = opts.emailStatus;
	const res = await call<{ data?: CampaignLead[] }>("GET", `campaigns/${id}/leads`, query);
	return res.data ?? [];
}

export async function messageHistory(campaignId: number, leadId: number): Promise<HistoryMessage[]> {
	const res = await call<{ history?: HistoryMessage[]; messages?: HistoryMessage[] }>(
		"GET",
		`campaigns/${campaignId}/leads/${leadId}/message-history`,
		{ show_plain_text_response: "true" },
	);
	return res.history ?? res.messages ?? [];
}

export function isInbound(m: HistoryMessage): boolean {
	return (m.type ?? "").toUpperCase() === "REPLY" || m.direction === "inbound";
}

export function messageTime(m: HistoryMessage): string | undefined {
	return m.time ?? m.received_at ?? m.sent_at;
}

/** Plain text of an email body: tags stripped, quoted thread dropped, whitespace collapsed. */
export function plainText(html: string): string {
	return html
		.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
		.replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.split(/\n(?:On .+wrote:|-{2,} ?Original Message)/)[0]
		.replace(/[ \t]+/g, " ")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
