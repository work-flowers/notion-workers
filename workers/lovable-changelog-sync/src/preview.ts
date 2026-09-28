/**
 * Local sanity check: fetch + parse the LIVE changelog and print the rows the
 * sync would write — no deploy, no Notion writes. Run with `npm run preview`.
 *
 * This is the fast "did the parser break?" check against the real page,
 * complementing the offline fixture tests in changelog.test.ts. Once deployed,
 * `ntn workers sync trigger changelogSync --preview` does the equivalent end to
 * end (still without writing to the database).
 */

import { fetchChangelogEntries } from "./changelog.js";

async function main(): Promise<void> {
	const entries = await fetchChangelogEntries();
	const dates = new Set(entries.map((e) => e.rawLabel));
	console.log(
		`Parsed ${entries.length} entries across ${dates.size} dates from the live changelog:\n`,
	);
	for (const e of entries) {
		console.log(`• ${e.name}`);
		console.log(`    date: ${e.entryDate}   key: ${e.key}`);
		console.log(`    url:  ${e.url}`);
		console.log(`    body: ${e.bodyMarkdown.length} chars — ${e.bodyMarkdown.slice(0, 80).replace(/\n/g, " ")}…`);
	}
}

main().catch((err: unknown) => {
	console.error("Preview failed:", err instanceof Error ? err.message : err);
	process.exitCode = 1;
});
