/**
 * One-time backfill: link each Email Analytics row to the Newsletter Issues
 * page holding that send's content.
 *
 * The two data sources share Buttondown's email identifier — Email Analytics
 * stores it as `Email ID`, Newsletter Issues as `Buttondown ID` — so the join is
 * exact and needs no fuzzy subject matching.
 *
 * The relation property must already exist on Email Analytics, added by hand.
 * It can't be declared in buttondown-sync's managed schema: that would mark it
 * read-only, and `Schema.relation()` only relates two syncs, which Newsletter
 * Issues isn't.
 *
 * Dry run (default) prints the plan and writes nothing:
 *   NOTION_API_TOKEN=ntn_... npx tsx scripts/backfill-issue-relation.ts
 *
 * Apply it:
 *   NOTION_API_TOKEN=ntn_... npx tsx scripts/backfill-issue-relation.ts --apply
 *
 * Override the property name if you called it something else:
 *   ... --property "Newsletter issue"
 *
 * Re-running is safe: rows whose relation already points at the right page are
 * skipped, so this can be used to catch up after new sends.
 */

const TOKEN = process.env.NOTION_API_TOKEN
if (!TOKEN) {
	console.error(
		"NOTION_API_TOKEN is not set.\n" +
			"Create a connection at https://app.notion.com/developers/connections, give it\n" +
			"access to the Newsletter database, then re-run with the token set.",
	)
	process.exit(1)
}

/** Data sources in the work.flowers `Newsletter` database. */
const ANALYTICS_DS = "c039fc57-f1f5-45d9-9c89-79dd7720eeed"
const ISSUES_DS = "0c691b07-11ac-82fa-bc1b-07d0186a095d"

/** Data-source endpoints need this version; 2022-06-28 only knows databases. */
const NOTION_VERSION = "2026-03-11"

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const propertyFlag = args.indexOf("--property")
const RELATION_PROPERTY =
	propertyFlag >= 0 ? (args[propertyFlag + 1] ?? "") : "Newsletter Issue"

type NotionPage = {
	id: string
	properties: Record<string, any>
}

async function notion(path: string, init?: RequestInit): Promise<any> {
	const response = await fetch(`https://api.notion.com/v1${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${TOKEN}`,
			"Notion-Version": NOTION_VERSION,
			"Content-Type": "application/json",
			...init?.headers,
		},
	})
	if (!response.ok) {
		throw new Error(
			`${init?.method ?? "GET"} ${path} → ${response.status}: ${await response.text()}`,
		)
	}
	return response.json()
}

/** Every page in a data source, following pagination. */
async function queryAll(dataSourceId: string): Promise<NotionPage[]> {
	const pages: NotionPage[] = []
	let cursor: string | undefined
	do {
		const body: Record<string, unknown> = { page_size: 100 }
		if (cursor) body.start_cursor = cursor
		const result = await notion(`/data_sources/${dataSourceId}/query`, {
			method: "POST",
			body: JSON.stringify(body),
		})
		pages.push(...result.results)
		cursor = result.has_more ? result.next_cursor : undefined
	} while (cursor)
	return pages
}

/** Plain text out of a title or rich_text property, whichever it is. */
function plainText(property: any): string {
	if (!property) return ""
	const parts = property.title ?? property.rich_text ?? []
	return parts.map((part: any) => part.plain_text ?? "").join("").trim()
}

function firstRelationId(property: any): string | null {
	const relation = property?.relation
	return Array.isArray(relation) && relation[0]?.id ? relation[0].id : null
}

async function main() {
	// Verify the property exists and points where we think before touching rows.
	const schema = await notion(`/data_sources/${ANALYTICS_DS}`)
	const relation = schema.properties?.[RELATION_PROPERTY]
	if (!relation) {
		const names = Object.keys(schema.properties ?? {}).join(", ")
		throw new Error(
			`Email Analytics has no property named "${RELATION_PROPERTY}".\n` +
				`Add a relation property pointing at Newsletter Issues, or pass --property.\n` +
				`Existing properties: ${names}`,
		)
	}
	if (relation.type !== "relation") {
		throw new Error(
			`"${RELATION_PROPERTY}" is a ${relation.type}, not a relation. Refusing to write.`,
		)
	}
	const target = relation.relation?.data_source_id ?? relation.relation?.database_id
	if (target && target.replace(/-/g, "") !== ISSUES_DS.replace(/-/g, "")) {
		console.warn(
			`⚠︎ "${RELATION_PROPERTY}" points at ${target}, not the Newsletter Issues ` +
				`data source (${ISSUES_DS}). Continuing, but check that's intended.`,
		)
	}

	const [analytics, issues] = await Promise.all([
		queryAll(ANALYTICS_DS),
		queryAll(ISSUES_DS),
	])

	// Buttondown id → issue page. Later duplicates would be ambiguous, so flag them.
	const issueByButtondownId = new Map<string, NotionPage>()
	const duplicates: string[] = []
	for (const issue of issues) {
		const id = plainText(issue.properties["Buttondown ID"])
		if (!id) continue
		if (issueByButtondownId.has(id)) duplicates.push(id)
		else issueByButtondownId.set(id, issue)
	}
	if (duplicates.length > 0) {
		console.warn(
			`⚠︎ ${duplicates.length} Buttondown ID(s) appear on more than one issue; ` +
				`using the first of each: ${duplicates.join(", ")}`,
		)
	}

	const toLink: { page: NotionPage; issue: NotionPage; subject: string }[] = []
	const alreadyLinked: string[] = []
	const unmatched: { subject: string; emailId: string }[] = []

	for (const row of analytics) {
		const subject = plainText(row.properties.Subject) || "(untitled)"
		const emailId = plainText(row.properties["Email ID"])
		if (!emailId) {
			unmatched.push({ subject, emailId: "(no Email ID)" })
			continue
		}
		const issue = issueByButtondownId.get(emailId)
		if (!issue) {
			unmatched.push({ subject, emailId })
			continue
		}
		if (firstRelationId(row.properties[RELATION_PROPERTY]) === issue.id) {
			alreadyLinked.push(subject)
			continue
		}
		toLink.push({ page: row, issue, subject })
	}

	console.log(`Email Analytics rows:  ${analytics.length}`)
	console.log(`Newsletter Issues:     ${issues.length}`)
	console.log(`Already linked:        ${alreadyLinked.length}`)
	console.log(`To link:               ${toLink.length}`)
	console.log(`No matching issue:     ${unmatched.length}`)
	for (const row of unmatched) {
		console.log(`  · ${row.subject}  [${row.emailId}]`)
	}
	console.log()

	if (toLink.length === 0) {
		console.log("Nothing to do.")
		return
	}

	if (!APPLY) {
		for (const { subject, issue } of toLink) {
			console.log(`  would link "${subject}" → ${issue.id}`)
		}
		console.log("\nDry run. Re-run with --apply to write these relations.")
		return
	}

	let written = 0
	for (const { page, issue, subject } of toLink) {
		await notion(`/pages/${page.id}`, {
			method: "PATCH",
			body: JSON.stringify({
				properties: {
					[RELATION_PROPERTY]: { relation: [{ id: issue.id }] },
				},
			}),
		})
		written += 1
		console.log(`  linked "${subject}"`)
	}
	console.log(`\nDone. ${written} relation(s) written.`)
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
