/**
 * Minimal read-only client for Aspire's public API (docs: https://docs.api.aspireapp.com).
 *
 * Auth is OAuth client credentials: POST /login returns a bearer token with no
 * refresh token, so a new one is requested per sync run (they last 15-30 min).
 */

const SANDBOX_BASE_URL = "https://demo-api.demo.aspireapp.com/public/v1";

export type AspireAccount = {
	id: string;
	account_type: string;
	account_status: string;
	currency_code: string;
	/** Smallest currency unit: cents for SGD, whole rupiah for IDR. */
	available_balance: number;
	debit_details?: { account_name?: string; bank_name?: string }[];
};

export type AspireTransaction = {
	id: string;
	account_id: string;
	ref_code: string;
	datetime: string;
	type: "credit" | "debit" | string;
	is_fx_transfer: boolean;
	channel: string;
	status: string;
	currency_code: string;
	/** Smallest currency unit, signed (debits are negative). */
	amount: number;
	reference: string | null;
	counterparty_name: string | null;
	counterparty_id: string | null;
	/** Account balance after the transaction, smallest currency unit. */
	balance: number | null;
	internal_notes: string | null;
	additional_info?: {
		destination_currency?: string | null;
		fee?: number | null;
		fx_rate?: number | null;
		card_holder?: string | null;
		card_name?: string | null;
		spend_category?: string | null;
	} | null;
};

type Page<T> = {
	data: T[];
	metadata: { current_page: number; next_page_url: string | null };
};

function env(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing environment variable ${name} (set it with \`ntn workers env set\`).`);
	return value;
}

function baseUrl(): string {
	return (process.env.ASPIRE_BASE_URL || SANDBOX_BASE_URL).replace(/\/$/, "");
}

export async function login(): Promise<string> {
	const res = await fetch(`${baseUrl()}/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			grant_type: "client_credentials",
			client_id: env("ASPIRE_CLIENT_ID"),
			client_secret: env("ASPIRE_CLIENT_SECRET"),
		}),
	});
	if (!res.ok) throw new Error(`Aspire login failed: ${res.status} ${await res.text()}`);
	const body = (await res.json()) as { access_token?: string };
	if (!body.access_token) throw new Error("Aspire login returned no access_token");
	return body.access_token;
}

async function get<T>(token: string, path: string, params: Record<string, string>): Promise<Page<T>> {
	const url = `${baseUrl()}${path}?${new URLSearchParams(params)}`;
	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
	if (!res.ok) throw new Error(`Aspire GET ${path} failed: ${res.status} ${await res.text()}`);
	return (await res.json()) as Page<T>;
}

export async function listAccounts(token: string, page: number) {
	return get<AspireAccount>(token, "/accounts", { page: String(page) });
}

/**
 * Aspire filters transactions by start_date and only returns what is newer, so
 * a fixed early date pulls the whole history. 100 per page.
 */
export async function listTransactions(token: string, page: number) {
	return get<AspireTransaction>(token, "/transactions", {
		start_date: "2015-01-01T00:00:00Z",
		page: String(page),
	});
}

// Aspire reports amounts in the currency's smallest unit as *Aspire* defines it:
// cents for SGD, but whole rupiah for IDR (ISO 4217 gives IDR two decimals, so
// Intl can't be trusted here).
const ZERO_DECIMAL = new Set(["IDR", "JPY", "KRW", "VND"]);

export function toMajorUnits(amount: number, currency: string): number {
	return ZERO_DECIMAL.has(currency.toUpperCase()) ? amount : amount / 100;
}
