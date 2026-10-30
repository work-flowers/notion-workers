import assert from "node:assert/strict";
import { test } from "node:test";
import { newRowProperties, parseMarketplaceEvent } from "./payload.js";

const purchase = {
	acquisitionId: "acq_123",
	time: 1761800000000,
	Event: "marketplace.purchase",
	productType: "Template",
	name: "CRM, Lite",
	slug: "crm-lite",
	templateName: "CRM, Lite",
	templateSlug: "crm-lite",
	listingPrice: 1900,
	totalCustomerPayment: 2052,
	taxAmount: 152,
	sellerTransferAmount: 1708,
	customerEmail: "buyer@example.com",
	customerOptInEmail: true,
	source: "web_gallery",
};

test("parses a purchase and converts cents to dollars", () => {
	const e = parseMarketplaceEvent(purchase);
	assert.ok(e);
	assert.equal(e.type, "marketplace.purchase");
	assert.equal(e.time, new Date(1761800000000).toISOString());
	const props = newRowProperties(e) as any;
	assert.equal(props.Status.select.name, "Acquired");
	assert.equal(props["Listing Price"].number, 19);
	assert.equal(props["Customer Paid"].number, 20.52);
	assert.equal(props["Discounted Price"].number, null);
	assert.equal(props.Product.select.name, "CRM  Lite");
	assert.equal(props["Email Opt-in"].checkbox, true);
	assert.ok(props["Acquired At"].date);
	assert.equal(props["Refunded At"], undefined);
});

test("free download with no email and lowercase event key", () => {
	const e = parseMarketplaceEvent({
		acquisitionId: "acq_free",
		event: "marketplace.purchase",
		templateName: "Free Thing",
		listingPrice: 0,
		totalCustomerPayment: 0,
		customerEmail: "",
	});
	assert.ok(e);
	assert.equal(e.name, "Free Thing");
	assert.equal(e.customerEmail, null);
	assert.equal((newRowProperties(e) as any)["Customer Email"].email, null);
});

test("refund without a prior row is created as Refunded", () => {
	const e = parseMarketplaceEvent({
		...purchase,
		Event: "marketplace.refund",
		refundReason: "other",
		customRefundReason: "Not what I expected",
	});
	assert.ok(e);
	const props = newRowProperties(e) as any;
	assert.equal(props.Status.select.name, "Refunded");
	assert.equal(props["Acquired At"], undefined);
	assert.equal(props["Refund Reason"].rich_text[0].text.content, "other: Not what I expected");
});

test("rejects non-Marketplace bodies", () => {
	assert.equal(parseMarketplaceEvent({ test: true }), null);
	assert.equal(parseMarketplaceEvent({ Event: "marketplace.other", acquisitionId: "x" }), null);
	assert.equal(parseMarketplaceEvent({ Event: "marketplace.purchase" }), null);
	assert.equal(parseMarketplaceEvent(null), null);
});
