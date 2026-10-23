# notion-worker-create-newsletter-page

A [Notion Worker](https://developers.notion.com/workers) that, when a **Blog**
page fires a webhook, creates a linked **Newsletter Issues** page mirroring the
blog post's content and cover.

## What it does

For each incoming webhook event (payload must carry the triggering blog
`page_id`):

1. **Reads** the blog page's full content as enhanced (Notion-flavored)
   Markdown — `GET /v1/pages/{id}/markdown`.
2. **Creates** a page in the Newsletter Issues data source from that data
   source's **default template** — `POST /v1/pages` with a `data_source_id`
   parent and `template: { type: "default" }` — so it gets the template's icon,
   property defaults (e.g. Status) and footer blocks, like a hand-made page. It
   also sets the title, the `Blog post` relation back to the blog page, and the
   blog page's cover. Notion-hosted file covers are re-uploaded via the File
   Upload API so the new cover doesn't point at an expiring signed URL; external
   covers are copied as-is. If the data source ever loses its default template,
   the worker logs a warning and creates a blank page instead.
3. **Inserts the blog content above the template.** A templated create can't
   carry content, and Notion applies the template asynchronously, so the worker
   polls (up to 20s) until the template's blocks appear, then prepends the blog
   Markdown — `PATCH /v1/pages/{id}/markdown` with `insert_content` at
   `position: { type: "start" }`. If the template is slow it prepends anyway;
   the template appends, so it still lands below the content.
4. **Restores body images.** The Markdown import drops images (Notion won't store
   the source's expiring S3 URLs, leaving empty image blocks). The worker walks
   the source and new pages' block trees in parallel, re-hosts each image via the
   File Upload API, and patches it onto the matching image block — preserving
   position, including inside columns.

All calls use Notion data API version **`2026-03-11`** via raw `fetch` (the
bundled SDK pins an older version that lacks the Markdown/data-source endpoints).

### Data sources

| Role | Name | Data source ID | Key properties |
|------|------|----------------|----------------|
| Trigger (source) | Blog | `1d791b07-11ac-8146-9124-000b0d6dbcc8` | title `Post Title`, page `cover` |
| Target (created) | Newsletter Issues | `0c691b07-11ac-82fa-bc1b-07d0186a095d` | title `Name`, relation `Blog post` → Blog |

The handler is idempotent: before creating, it queries Newsletter Issues for an
existing page already related to the blog post and skips if one is found, so
Notion/webhook retries won't create duplicates.

## Setup

```bash
npm install
npm run check        # type-check
npm run build        # compile to dist/

ntn login            # authenticate the CLI (first time)

# Provide the Notion token the webhook handler uses (webhooks are NOT
# auto-authenticated). Personal access token, or an internal integration that
# is connected to BOTH the Blog and Newsletter databases.
ntn workers env set NOTION_API_TOKEN=ntn_...

# Deploy (first deploy creates the worker)
ntn workers deploy --name create-newsletter-page

# Get the webhook URL to wire into Notion
ntn workers webhooks list
```

The integration/token needs these capabilities: `read_content`,
`insert_content`, `insert_property`, `update_content`.

## Wiring the trigger in Notion

The webhook is fired by the **Create Newsletter** button (or an automation) on
the Blog database:

1. Copy the URL from `ntn workers webhooks list` (capability key
   `onCreateNewsletter`).
2. In the Blog database, edit the **Create Newsletter** button / add a database
   automation whose action is **Send webhook** to that URL.
3. Ensure the payload includes the page id. Notion's "Send webhook" action posts
   the triggering page object — the handler reads the id from `data.id` (and
   also accepts top-level `page_id`/`id`, `entity.id`, `source.page_id`).

> Treat the webhook URL as a secret — anyone with it can post events. It carries
> a unique secret segment; there is no separate Notion-side signature to verify.

## Project layout

- `src/index.ts` — the worker (single `onCreateNewsletter` webhook capability).
- `.env.example` — the one secret the worker needs for local runs.

## Operational notes

- **Large posts:** the Markdown API sets `truncated: true` for very large pages;
  the worker logs a warning when that happens.
- **Logs:** `ntn workers runs list`, then `ntn workers runs logs <runId>`.
- **Local `ntn workers exec --local`** is currently broken in `ntn` 0.14.1
  (an ESM `mod.default.default` bug reproducible on the stock template); use a
  real deploy to test end-to-end.
