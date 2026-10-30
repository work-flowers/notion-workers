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

/**
 * Leads in a campaign, optionally only those with activity (sent or reply)
 * after `eventTimeGt`, or added after `createdAtGt`.
 */
export async function campaignLeads(
	id: number,
	offset: number,
	opts: { eventTimeGt?: string; createdAtGt?: string; emailStatus?: string; limit?: number } = {},
): Promise<CampaignLead[]> {
	const query: Record<string, string> = { offset: String(offset), limit: String(opts.limit ?? LEADS_PAGE) };
	if (opts.eventTimeGt) query.event_time_gt = opts.eventTimeGt;
	if (opts.createdAtGt) query.created_at_gt = opts.createdAtGt;
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

export type NewLead = {
	email: string;
	first_name?: string;
	last_name?: string;
	company_name?: string;
	location?: string;
	linkedin_profile?: string;
	custom_fields?: Record<string, string>;
};

type AddLeadsResponse = {
	upload_count?: number;
	already_added_to_campaign?: number;
	skipped_in_other_campaign_count?: number;
	block_count?: number;
	bounce_count?: number;
	invalid_email_count?: number;
	duplicate_count?: number;
	unsubscribed_leads?: unknown[];
	is_lead_limit_exhausted?: boolean;
};

/**
 * Adds one lead. Smartlead answers 200 even when it skips the lead, so the
 * counters decide. Already being in this campaign counts as success, which
 * makes a retried webhook delivery harmless.
 */
export async function addLead(campaignId: number, lead: NewLead): Promise<{ ok: true } | { ok: false; reason: string }> {
	const r = await call<AddLeadsResponse>("POST", `campaigns/${campaignId}/leads`, {}, { lead_list: [lead] });
	if ((r.upload_count ?? 0) > 0 || (r.already_added_to_campaign ?? 0) > 0) return { ok: true };
	const reason =
		(r.skipped_in_other_campaign_count ?? 0) > 0
			? "already in another Smartlead campaign"
			: (r.unsubscribed_leads?.length ?? 0) > 0
				? "on Smartlead's unsubscribe list"
				: (r.block_count ?? 0) > 0
					? "on Smartlead's block list"
					: (r.bounce_count ?? 0) > 0
						? "on Smartlead's bounce list"
						: (r.invalid_email_count ?? 0) > 0
							? "invalid email"
							: r.is_lead_limit_exhausted
								? "Smartlead lead limit reached"
								: `not uploaded (${JSON.stringify(r).slice(0, 200)})`;
	return { ok: false, reason };
}

/**
 * Stops the lead in every campaign it is in, so no further steps send: marks
 * it complete, or pauses it where Smartlead refuses that (it 404s
 * manual-complete on a campaign with no sequences). Counts are per campaign;
 * both are 0 if Smartlead doesn't know the email.
 */
export async function stopLeadEverywhere(email: string): Promise<{ completed: number; paused: number }> {
	let lead: { id?: number | string; lead_campaign_data?: { campaign_id: number; campaign_lead_map_id: number }[] };
	try {
		lead = await call("GET", "leads/", { email });
	} catch (err) {
		if (String((err as Error).message).includes(" 404 ")) return { completed: 0, paused: 0 };
		throw err;
	}
	const result = { completed: 0, paused: 0 };
	for (const m of lead?.lead_campaign_data ?? []) {
		try {
			await call("POST", `campaigns/${m.campaign_id}/leads/${m.campaign_lead_map_id}/manual-complete`);
			result.completed++;
		} catch {
			await call("POST", `campaigns/${m.campaign_id}/leads/${lead.id}/pause`);
			result.paused++;
		}
	}
	return result;
}
