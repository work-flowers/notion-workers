import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import {
	type AspireAccount,
	type AspireTransaction,
	listAccounts,
	listTransactions,
	login,
	toMajorUnits,
} from "./aspire.js";

const worker = new Worker();
export default worker;

/**
 * One-way, read-only sync of an Aspire business account into two managed
 * databases. Built for a demo (TKT-1058) against Aspire's sandbox, so the
 * databases are titled as sandbox data and the rows are synced as-is.
 */

const CURRENCIES = [
	{ name: "SGD", color: "red" },
	{ name: "USD", color: "green" },
	{ name: "EUR", color: "blue" },
	{ name: "HKD", color: "orange" },
	{ name: "IDR", color: "purple" },
	{ name: "GBP", color: "brown" },
] as const;

const accounts = worker.database("aspireAccounts", {
	type: "managed",
	initialTitle: "Aspire Accounts (sandbox)",
	primaryKeyProperty: "Account ID",
	schema: {
		properties: {
			Account: Schema.title(),
			"Account ID": Schema.richText(),
			Currency: Schema.select([...CURRENCIES]),
			"Available Balance": Schema.number("number_with_commas"),
			Type: Schema.select([
				{ name: "debit", color: "default" },
				{ name: "credit", color: "gray" },
			]),
			Status: Schema.select([
				{ name: "active", color: "green" },
				{ name: "inactive", color: "gray" },
				{ name: "frozen", color: "red" },
			]),
			Bank: Schema.richText(),
			"Last Synced": Schema.date(),
		},
	},
});

const transactions = worker.database("aspireTransactions", {
	type: "managed",
	initialTitle: "Aspire Transactions (sandbox)",
	primaryKeyProperty: "Transaction ID",
	schema: {
		properties: {
			Description: Schema.title(),
			"Transaction ID": Schema.richText(),
			"Ref Code": Schema.richText(),
			Date: Schema.date(),
			// Signed, in major units of the row's currency (debits negative).
			Amount: Schema.number("number_with_commas"),
			Currency: Schema.select([...CURRENCIES]),
			Direction: Schema.select([
				{ name: "credit", color: "green" },
				{ name: "debit", color: "red" },
			]),
			Status: Schema.select([
				{ name: "settled", color: "green" },
				{ name: "posted", color: "blue" },
				{ name: "pending", color: "yellow" },
				{ name: "refunded", color: "orange" },
				{ name: "failed", color: "red" },
			]),
			Channel: Schema.select([
				{ name: "banktransfer", color: "blue" },
				{ name: "card", color: "purple" },
			]),
			"Spend Category": Schema.select([
				{ name: "API Payments", color: "gray" },
				{ name: "Salary", color: "green" },
				{ name: "Marketing", color: "pink" },
				{ name: "Travel", color: "blue" },
				{ name: "Equipment", color: "brown" },
				{ name: "Office rental", color: "orange" },
				{ name: "Service provider", color: "purple" },
				{ name: "Entertainment", color: "yellow" },
				{ name: "Sales", color: "green" },
				{ name: "Others", color: "default" },
			]),
			Counterparty: Schema.richText(),
			Reference: Schema.richText(),
			"Balance After": Schema.number("number_with_commas"),
			Fee: Schema.number("number_with_commas"),
			"FX Transfer": Schema.checkbox(),
			"FX Rate": Schema.number("number"),
			"Destination Currency": Schema.richText(),
			Card: Schema.richText(),
			"Internal Notes": Schema.richText(),
			Account: Schema.relation("aspireAccounts", { twoWay: true, relatedPropertyName: "Transactions" }),
		},
	},
});

// Aspire: GET endpoints < 100 requests/minute each, login < 100/minute.
const aspire = worker.pacer("aspire", { allowedRequests: 60, intervalMs: 60_000 });

type PageState = { page: number };

// Row icon for both databases. A logo.dev publishable (pk_) token, meant to sit in client code.
// Set on every upsert: the sync owns the page, so an omitted icon would be cleared.
const ASPIRE_ICON = Builder.imageIcon("https://img.logo.dev/aspireapp.com?token=pk_MgvuyiQuRe6IT_XWNAUgrA");

// An empty property value. Builder has no "clear" helper, but its values are
// token arrays and an empty array is what Builder.number(NaN) produces.
const EMPTY = [] as unknown as ReturnType<typeof Builder.select>;
const optSelect = (v: string | null | undefined) => (v ? Builder.select(v) : EMPTY);
const optNumber = (v: number | null | undefined) => (v == null ? EMPTY : Builder.number(v));

function accountLabel(a: AspireAccount): string {
	const bank = a.debit_details?.[0]?.bank_name;
	return [a.currency_code, bank, `…${a.id.slice(-4)}`].filter(Boolean).join(" · ");
}

function toAccountUpsert(a: AspireAccount, now: string) {
	return {
		type: "upsert" as const,
		icon: ASPIRE_ICON,
		// Must be byte-identical to the "Account ID" value, or every run inserts a new row.
		key: a.id,
		properties: {
			Account: Builder.title(accountLabel(a)),
			"Account ID": Builder.richText(a.id),
			Currency: Builder.select(a.currency_code),
			"Available Balance": Builder.number(toMajorUnits(a.available_balance, a.currency_code)),
			Type: Builder.select(a.account_type),
			Status: Builder.select(a.account_status),
			Bank: Builder.richText(
				[...new Set((a.debit_details ?? []).map((d) => d.bank_name).filter(Boolean))].join(", "),
			),
			"Last Synced": Builder.dateTime(now),
		},
	};
}

function toTransactionUpsert(t: AspireTransaction) {
	const info = t.additional_info ?? {};
	const cur = t.currency_code;
	const description = t.counterparty_name || t.reference || t.ref_code;
	const card = [info.card_name, info.card_holder].filter(Boolean).join(" · ");
	return {
		type: "upsert" as const,
		icon: ASPIRE_ICON,
		// Must be byte-identical to the "Transaction ID" value, or every run inserts a new row.
		key: t.id,
		properties: {
			Description: Builder.title(description),
			"Transaction ID": Builder.richText(t.id),
			"Ref Code": Builder.richText(t.ref_code ?? ""),
			Date: Builder.dateTime(t.datetime),
			Amount: Builder.number(toMajorUnits(t.amount, cur)),
			Currency: optSelect(cur),
			Direction: optSelect(t.type),
			Status: optSelect(t.status),
			Channel: optSelect(t.channel),
			"Spend Category": optSelect(info.spend_category),
			Counterparty: Builder.richText(t.counterparty_name ?? ""),
			Reference: Builder.richText(t.reference ?? ""),
			"Balance After": optNumber(t.balance == null ? null : toMajorUnits(t.balance, cur)),
			Fee: optNumber(info.fee == null ? null : toMajorUnits(info.fee, cur)),
			"FX Transfer": Builder.checkbox(Boolean(t.is_fx_transfer)),
			"FX Rate": optNumber(info.fx_rate),
			"Destination Currency": Builder.richText(info.destination_currency ?? ""),
			Card: Builder.richText(card),
			"Internal Notes": Builder.richText(t.internal_notes ?? ""),
			Account: [Builder.relation(t.account_id)],
		},
	};
}

/**
 * Full refresh: the sandbox holds a handful of accounts, so replace mode keeps
 * Notion an exact mirror (closed accounts disappear) at negligible cost.
 */
worker.sync("aspireAccountsSync", {
	database: accounts,
	mode: "replace",
	schedule: "1h",
	execute: async (state: PageState | undefined) => {
		const page = state?.page ?? 1;
		await aspire.wait();
		const token = await login();
		await aspire.wait();
		const res = await listAccounts(token, page);
		const now = new Date().toISOString();
		const hasMore = Boolean(res.metadata?.next_page_url) && res.data.length > 0;
		return {
			changes: res.data.map((a) => toAccountUpsert(a, now)),
			hasMore,
			nextState: hasMore ? { page: page + 1 } : undefined,
		};
	},
});

/**
 * Full refresh of the whole transaction history. Fine at sandbox scale (tens of
 * rows); a real account would want an incremental sync keyed on start_date.
 */
worker.sync("aspireTransactionsSync", {
	database: transactions,
	mode: "replace",
	schedule: "1h",
	execute: async (state: PageState | undefined) => {
		const page = state?.page ?? 1;
		await aspire.wait();
		const token = await login();
		await aspire.wait();
		const res = await listTransactions(token, page);
		const hasMore = Boolean(res.metadata?.next_page_url) && res.data.length > 0;
		return {
			changes: res.data.map(toTransactionUpsert),
			hasMore,
			nextState: hasMore ? { page: page + 1 } : undefined,
		};
	},
});
