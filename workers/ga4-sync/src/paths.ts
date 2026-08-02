/**
 * URL path normalisation and classification.
 *
 * GA4 reports `/blog/x` and `/blog/x/` as two separate pages, and the site emits
 * both — six URLs were being double-counted before this existed. Notion is no
 * more consistent: most blog slugs read `/slug`, a handful read `slug`, and one
 * reads `slug/`. Everything on both sides therefore goes through `normalizePath`
 * before it is compared or used as a sync key.
 */

/** GA4 sentinels that are not paths and must survive normalisation untouched. */
const SENTINELS = new Set(["(not set)", "(other)", "(none)"]);

/**
 * Canonical form of a URL path: lower-cased, query and fragment dropped,
 * repeated slashes collapsed, exactly one leading slash, no trailing slash.
 * The site root normalises to `/`.
 */
export function normalizePath(raw: string): string {
	const input = (raw ?? "").trim();
	if (SENTINELS.has(input.toLowerCase())) return input.toLowerCase();

	const withoutQuery = input.split("?")[0].split("#")[0];
	const collapsed = withoutQuery
		.toLowerCase()
		.replace(/\/{2,}/g, "/")
		.replace(/^\/+|\/+$/g, "");

	return collapsed === "" ? "/" : `/${collapsed}`;
}

export type PageKind =
	| "Home"
	| "Static Page"
	| "Blog Post"
	| "Blog Index"
	| "Blog Tag"
	| "Blog Author"
	| "Other";

export function classifyPath(normalized: string): PageKind {
	if (normalized === "/") return "Home";
	if (normalized === "/blog") return "Blog Index";
	if (!normalized.startsWith("/blog/")) {
		return SENTINELS.has(normalized) ? "Other" : "Static Page";
	}

	const rest = normalized.slice("/blog/".length);
	if (rest.startsWith("tags/")) return "Blog Tag";
	if (rest.startsWith("authors/")) return "Blog Author";
	// `/blog/page/2` — pagination of the index itself.
	if (rest.startsWith("page/")) return "Blog Index";
	return "Blog Post";
}

/**
 * The Notion `Slug` a GA4 path corresponds to, or null when the path is not a
 * blog post. Slugs in Notion carry no `/blog` prefix.
 */
export function blogSlugFromPath(normalized: string): string | null {
	if (classifyPath(normalized) !== "Blog Post") return null;
	return normalized.slice("/blog".length);
}

/** The GA4 path a Notion blog `Slug` corresponds to. */
export function pathFromBlogSlug(slug: string): string {
	const normalized = normalizePath(slug);
	return normalized === "/" ? "/blog" : `/blog${normalized}`;
}
