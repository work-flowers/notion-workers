/**
 * Parsing and property mapping for Notion Marketplace webhooks.
 * Field reference: https://www.notion.com/help/selling-on-marketplace#webhooks
 */

export type MarketplaceEventType = "marketplace.purchase" | "marketplace.refund";

export interface MarketplaceEvent {
	type: MarketplaceEventType;
	acquisitionId: string;
	/** ISO timestamp of the transaction. */
	time: string | null;
	productType: string | null;
	name: string | null;
	slug: string | null;
	/** All money fields are in cents, as sent. */
	listingPrice: number | null;
	totalCustomerPayment: number | null;
	discountedPrice: number | null;
	taxAmount: number | null;
	sellerTransferAmount: number | null;
	customerEmail: string | null;
	customerOptInEmail: boolean | null;
	couponCode: string | null;
	locale: string | null;
	source: string | null;
	refundReason: string | null;
}

function str(v: unknown): string | null {
	if (typeof v === "string" && v.trim()) return v.trim();
	if (typeof v === "number") return String(v);
	return null;
}

function num(v: unknown): number | null {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
	return null;
}

function bool(v: unknown): boolean | null {
	if (typeof v === "boolean") return v;
	if (v === "true") return true;
	if (v === "false") return false;
	return null;
}

function isoFromMillis(v: unknown): string | null {
	const ms = num(v);
	if (ms === null) return null;
	const d = new Date(ms);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Returns the parsed event, or null when the body isn't a Marketplace event we
 * handle (no acquisitionId, or an unknown event type). The docs spell the
 * event field `Event`; `event` is accepted too.
 */
export function parseMarketplaceEvent(body: unknown): MarketplaceEvent | null {
	if (!body || typeof body !== "object") return null;
	const b = body as Record<string, unknown>;

	const type = str(b.Event ?? b.event);
	if (type !== "marketplace.purchase" && type !== "marketplace.refund") return null;
	const acquisitionId = str(b.acquisitionId);
	if (!acquisitionId) return null;

	const refundReason = [str(b.refundReason), str(b.customRefundReason)]
		.filter(Boolean)
		.join(": ");

	return {
		type,
		acquisitionId,
		time: isoFromMillis(b.time),
		productType: str(b.productType),
		name: str(b.name ?? b.templateName),
		slug: str(b.slug ?? b.templateSlug),
		listingPrice: num(b.listingPrice),
		totalCustomerPayment: num(b.totalCustomerPayment),
		discountedPrice: num(b.discountedPrice),
		taxAmount: num(b.taxAmount),
		sellerTransferAmount: num(b.sellerTransferAmount),
		customerEmail: str(b.customerEmail),
		customerOptInEmail: bool(b.customerOptInEmail),
		couponCode: str(b.couponCode),
		locale: str(b.locale),
		source: str(b.source),
		refundReason: refundReason || null,
	};
}

// --- Notion property builders ----------------------------------------------

const text = (s: string) => ({ rich_text: [{ text: { content: s.slice(0, 2000) } }] });
const dollars = (cents: number | null) => ({
	number: cents === null ? null : Math.round(cents) / 100,
});
// Select option names can't contain commas.
const select = (s: string | null) => ({
	select: s ? { name: s.replace(/,/g, " ").slice(0, 100) } : null,
});
const date = (iso: string | null) => ({ date: iso ? { start: iso } : null });

export function pageTitle(e: MarketplaceEvent): string {
	return `${e.name ?? e.slug ?? "Unknown product"} – ${e.customerEmail ?? e.acquisitionId}`;
}

/** Full property set for a new row. */
export function newRowProperties(e: MarketplaceEvent): Record<string, unknown> {
	const props: Record<string, unknown> = {
		Name: { title: [{ text: { content: pageTitle(e) } }] },
		"Acquisition ID": text(e.acquisitionId),
		Status: select(e.type === "marketplace.refund" ? "Refunded" : "Acquired"),
		Product: select(e.name),
		"Product Type": select(e.productType),
		Slug: text(e.slug ?? ""),
		"Customer Email": { email: e.customerEmail },
		"Email Opt-in": { checkbox: e.customerOptInEmail === true },
		"Listing Price": dollars(e.listingPrice),
		"Discounted Price": dollars(e.discountedPrice),
		"Customer Paid": dollars(e.totalCustomerPayment),
		Tax: dollars(e.taxAmount),
		"Seller Payout": dollars(e.sellerTransferAmount),
		"Coupon Code": text(e.couponCode ?? ""),
		Source: select(e.source),
		Locale: select(e.locale),
	};
	if (e.type === "marketplace.purchase") {
		props["Acquired At"] = date(e.time);
	} else {
		// Refund seen before (or without) its purchase: the purchase time is
		// unknown, so only the refund side is dated.
		Object.assign(props, refundProperties(e));
	}
	return props;
}

/** Properties a refund changes on an existing purchase row. */
export function refundProperties(e: MarketplaceEvent): Record<string, unknown> {
	return {
		Status: select("Refunded"),
		"Refunded At": date(e.time),
		"Refund Reason": text(e.refundReason ?? ""),
	};
}
