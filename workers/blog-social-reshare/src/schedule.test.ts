import assert from "node:assert/strict";
import { test } from "node:test";
import {
	blogUrlFromSlug,
	nextBusinessDay,
	reshareSlot,
	sgtCalendarDate,
	withUtm,
} from "./schedule.js";

test("sgtCalendarDate keeps date-only values and converts datetimes to SGT", () => {
	assert.equal(sgtCalendarDate("2026-10-28"), "2026-10-28");
	assert.equal(sgtCalendarDate("2026-09-28T00:00:00.000Z"), "2026-09-28");
	// 20:00Z on the 27th is 04:00 on the 28th in Singapore.
	assert.equal(sgtCalendarDate("2026-09-27T20:00:00.000Z"), "2026-09-28");
	assert.equal(sgtCalendarDate("2026-09-28T07:00:00.000+08:00"), "2026-09-28");
});

test("nextBusinessDay skips weekends", () => {
	assert.equal(nextBusinessDay("2026-10-28"), "2026-10-29"); // Wed -> Thu
	assert.equal(nextBusinessDay("2026-10-30"), "2026-11-02"); // Fri -> Mon
	assert.equal(nextBusinessDay("2026-10-31"), "2026-11-02"); // Sat -> Mon
	assert.equal(nextBusinessDay("2026-11-01"), "2026-11-02"); // Sun -> Mon
	assert.equal(nextBusinessDay("2026-12-31"), "2027-01-01"); // year rollover
});

test("reshareSlot is 8am SGT the next business day", () => {
	const now = new Date("2026-10-27T10:00:00Z");
	assert.equal(reshareSlot("2026-10-28", now), "2026-10-29T08:00:00+08:00");
	assert.equal(reshareSlot("2026-10-30", now), "2026-11-02T08:00:00+08:00");
});

test("reshareSlot rolls a past slot forward from now", () => {
	// Tue 27 Oct 10:00Z = 18:00 SGT; a September post would land in the past.
	const now = new Date("2026-10-27T10:00:00Z");
	assert.equal(reshareSlot("2026-09-01", now), "2026-10-28T08:00:00+08:00");
	// Friday evening SGT rolls to Monday.
	const fri = new Date("2026-10-30T12:00:00Z");
	assert.equal(reshareSlot("2026-09-01", fri), "2026-11-02T08:00:00+08:00");
});

test("blogUrlFromSlug and withUtm", () => {
	const url = blogUrlFromSlug("/next-gen-zaps");
	assert.equal(url, "https://www.work.flowers/blog/next-gen-zaps");
	assert.equal(blogUrlFromSlug("next-gen-zaps"), url);
	assert.equal(
		withUtm(url),
		"https://www.work.flowers/blog/next-gen-zaps?utm_source=linkedin&utm_medium=social&utm_campaign=blog_reshare",
	);
	assert.equal(
		withUtm(`${url}?utm_source=x&ref=a`),
		"https://www.work.flowers/blog/next-gen-zaps?utm_source=linkedin&ref=a&utm_medium=social&utm_campaign=blog_reshare",
	);
});
