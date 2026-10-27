/**
 * Pure helpers for the reshare: when to post, and which link to post.
 * Kept free of Notion I/O so they can be unit-tested.
 */

/** Singapore is UTC+8 all year (no DST), so a fixed offset is exact. */
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const SGT_OFFSET = "+08:00";
/** Local hour the reshare goes out. */
const POST_HOUR = "08:00:00";

const BLOG_BASE_URL = "https://www.work.flowers/blog";

/** Same tags the hand-made blog reshares already use. */
export const UTM_PARAMS: Record<string, string> = {
	utm_source: "linkedin",
	utm_medium: "social",
	utm_campaign: "blog_reshare",
};

/**
 * Calendar date (YYYY-MM-DD) in Singapore for a Notion date `start`. A
 * date-only value is taken as-is; a datetime is converted to SGT first, so a
 * post dated "2026-09-28T00:00:00Z" counts as the 28th, not the 27th.
 */
export function sgtCalendarDate(start: string): string {
	if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
	const ms = Date.parse(start);
	if (Number.isNaN(ms)) throw new Error(`Unparseable date: ${start}`);
	return new Date(ms + SGT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The next Mon–Fri strictly after `date` (YYYY-MM-DD). Public holidays are not skipped. */
export function nextBusinessDay(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	do {
		d.setUTCDate(d.getUTCDate() + 1);
	} while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
	return d.toISOString().slice(0, 10);
}

/**
 * 8am SGT on the business day after the blog's publish date, as an ISO
 * datetime with offset. If that slot is already past (the automation fired
 * late, or on an old post), roll forward to the next business day after
 * `now` instead, so Scheduled.so never receives a post dated in the past.
 */
export function reshareSlot(blogDateStart: string, now: Date = new Date()): string {
	let day = nextBusinessDay(sgtCalendarDate(blogDateStart));
	if (Date.parse(`${day}T${POST_HOUR}${SGT_OFFSET}`) <= now.getTime()) {
		day = nextBusinessDay(sgtCalendarDate(now.toISOString()));
	}
	return `${day}T${POST_HOUR}${SGT_OFFSET}`;
}

/** Public blog URL from a slug like "/next-gen-zaps" (leading slash optional). */
export function blogUrlFromSlug(slug: string): string {
	const s = slug.trim().replace(/^\/+/, "").replace(/^blog\//, "");
	return `${BLOG_BASE_URL}/${s}`;
}

/** Append the reshare UTM tags, replacing any utm_* already on the URL. */
export function withUtm(url: string): string {
	const u = new URL(url);
	for (const [k, v] of Object.entries(UTM_PARAMS)) u.searchParams.set(k, v);
	return u.toString();
}
