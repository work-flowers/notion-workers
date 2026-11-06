# Product Changelogs (RSS → Notion)

Replaces the `api-changelog-sync` and `lovable-changelog-sync` workers (deleted
2026-11-06). One page per changelog entry per product, in the ordinary Notion
database **Product Changelogs** (data source
`6d311e8f-6533-4dbe-8c86-6c7581b58942`), each with its product's logo.dev
logo as the page icon.

| Piece | What it does |
| :-- | :-- |
| [`workflow.ts`](workflow.ts) | Source of the Zapier durable workflow **product-changelogs-rss** ([editor](https://zapier.com/workflow/01a1aea0-1d78-7532-84b4-7418bfce4c87)), private, on the work.flowers Zapier account. Copy kept here for review; the deployed version is the source of truth. |
| [`../changelog-backfill.ts`](../changelog-backfill.ts) | One-time (re-runnable) fill of every past date of the **Mintlify** feeds from their `.md` pages; skips Keys that already exist. `--icons` sets the logo icon on existing pages. |

## Feeds

| Product | Feed | Body from | Key |
| :-- | :-- | :-- | :-- |
| Notion API | `developers.notion.com/page/changelog/rss.xml` | `mintlify`: that date's section of the `.md` page | `notion-api:<ISO date>` |
| Lovable | `docs.lovable.dev/changelog/rss.xml` | `mintlify` | `lovable:<ISO date>` |
| Notion | `www.notion.com/releases/rss.xml` | `page`: the release page via Zapier's Web Parser (markdown) | `notion:releases/<date>` |

The trigger is RSS by Zapier **New Items in Multiple Feeds** (up to 10 URLs).
For each item the workflow builds the body (per the feed's `body.kind`),
looks the page up by `Key`, and either creates it (with the logo icon) or
replaces its body (and fixes the icon if it differs). It throws, rather than
writing an empty page, when the content can't be found.

- **`mintlify`** feeds have one RSS item per date and no usable body, so the
  text is sliced from the site's own `.md` page: cleaner than any scraper.
- **`page`** is the generic default for any other feed: one RSS item per page,
  body from Web Parser, with the lead image put first, relative links made
  absolute, and lines matching the feed's `strip` patterns dropped.

## Adding a feed

1. Add a `Product` select option in Notion.
2. Add an entry to `FEEDS` in `workflow.ts` (`mintlify` if it's a Mintlify
   changelog with a `.md` twin, else `page`; plus the logo domain) and its URL
   to the trigger, then republish.
3. Backfill it: a `page` feed by running the workflow once with
   `{ "backfill_feed_url": "<feed url>" }` (a draft test run isn't
   task-charged); a `mintlify` feed with
   `npx tsx scripts/changelog-backfill.ts <feed id>` after adding it to that
   script's `FEEDS` too, since its RSS only carries the last 15 dates.

## Gotchas found building it (2026-11-06)

- **Mintlify changed its `.md` output** in late October 2026, from raw MDX
  (`<Update label="…">` blocks) to rendered markdown with a bold `**Date**`
  line per entry. That is what broke both workers: their parsers found zero
  entries and every run failed.
- **Mintlify's RSS feeds carry only the last 15 dates**, and Notion API's has
  no body, hence the backfill script and the `.md` slicing.
- **Publishing doesn't replay existing feed items**: no runs fired when the
  trigger went live, so every new feed needs an explicit backfill.
- **The durable sandbox has no DNS.** Global `fetch` fails with `EAI_AGAIN`;
  use `sdk.fetch(url, { method: "GET" })`, which goes out through Zapier's
  Relay.
- **The Notion app's "API Request" action drops a JSON string body.** A query
  with a `Key` filter came back unfiltered (100 arbitrary rows), and a PATCH
  failed with `body.type should be defined`. The workflow calls Notion through
  `sdk.fetch` with the connection instead, and refuses to overwrite a page
  whose `Key` doesn't match exactly.
- **No `Date` in workflow code** (the durable runtime's determinism guard), so
  `pubDate` is parsed by regex.
- The Zapier Notion connection only sees pages shared with the **Zapier**
  integration; the database had to be shared with it by hand.
- **Icons:** the workflow can't use an `img.logo.dev?token=pk_…` URL: the
  publish analyzer rejects *any* key in source (`hardcoded-credential`), even
  logo.dev's publishable one. It instead calls the logo.dev Brand API through
  the `logo_dev` connection (secret key, shared with
  `deal-to-client-drive-folder` in `work-flowers/zapier-sdk`), downloads the
  logo as a 256px PNG, uploads it to Notion and sets it as a `file_upload`
  icon. A brand logo.dev doesn't know (yet) just leaves the page without an
  icon. Pages backfilled before that (all 232 Mintlify-feed pages and the 154
  releases from the first backfill) carry the equivalent external
  `img.logo.dev` icon, set by `changelog-backfill.ts --icons` and the earlier
  workflow version, with the publishable key `notion-review-to-company-logo`
  already uses.
- **Web Parser drops headings** on Notion's release pages, so their bodies
  read as plain paragraphs (the hero image and links survive).
