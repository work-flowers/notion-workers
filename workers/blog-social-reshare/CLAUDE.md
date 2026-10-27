# blog-social-reshare

Webhook worker: when a Blog Content post is published, create one Social Content page that reshares it on the workFlowers LinkedIn company page. It is a low-effort automated feed — the post body is the blog's `Description`, verbatim, with no tailoring.

## Trigger

Capability `onBlogPublished` (`worker.webhook`). A Notion database automation on **Blog Content** fires a "Send webhook" action to the URL from `ntn workers webhooks list` (treat it as a secret — not recorded here). Suggested trigger: `Publish` is checked. The worker reads the page id from `data.id` and re-fetches the page, so the automation body needs no custom properties.

## Data sources

| | id |
|---|---|
| Blog Content (source) | `1d791b07-11ac-8146-9124-000b0d6dbcc8` |
| Social Content (target) | `14591b07-11ac-8187-934a-000b1a3a474d` |

## What it writes

| Social Content property | Value |
|---|---|
| `Name` | `Blog: <Post Title>` |
| page body | `Description`, sent as the `markdown` create param |
| `Channel` | `LIPAGE@work-flowers` |
| `Type` | `Blog Post Reshare` |
| `Status` | `Ready to schedule 🕑` — there is no "Ready to Publish" option |
| `Publication Date` | 08:00 SGT on the next Mon–Fri after the blog's `Date` |
| `sc_title_article` | `Post Title` |
| `sc_link_article` | `Public URL`, else `https://www.work.flowers/blog` + `Slug`, with `utm_source=linkedin&utm_medium=social&utm_campaign=blog_reshare` (the tags the hand-made reshares already use) |
| `Blog Post` | relation to the blog page |

## Behaviour notes

- **Idempotent**: skips if a Social Content page already relates to the post *and* has `Channel` = `LIPAGE@work-flowers`. Reshares on other channels (e.g. `LI@dchiuten`) don't block it.
- **Past slots roll forward**: if 08:00 on the next business day is already past (late trigger, old post), it uses the next business day after *now* instead, so Scheduled.so never gets a back-dated post.
- Public holidays are not skipped — only weekends.
- Missing `Post Title`, `Description`, `Date` or `Slug` → logged and skipped (no throw; the automation re-fires on the next edit that matches).
- Date logic lives in `src/schedule.ts`; `npm test --workspace=notion-worker-blog-social-reshare`.

## Setup

1. `./scripts/deploy.sh blog-social-reshare` from the repo root. The first deploy needs `--name blog-social-reshare` to create the worker and its `workers.json`.
2. `ntn workers env set NOTION_API_TOKEN=ntn_...` (from this directory) — needs read on Blog Content and insert on Social Content.
3. Add the Blog Content automation pointing at the webhook URL.
