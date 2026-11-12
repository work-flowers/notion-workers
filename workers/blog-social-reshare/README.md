# blog-social-reshare

When a post is published in **Blog Content**, this worker creates a
**Social Content** page that reshares it on the workFlowers LinkedIn company
page. It's a low-effort automated feed: the post text is the blog's
`Description`, used verbatim.

## How it's triggered

A Notion database automation on Blog Content (suggested trigger: `Publish` is
checked) runs a **Send webhook** action to this worker's `onBlogPublished`
URL. Get the URL with `ntn workers webhooks list` from the worker's directory,
and treat it as a secret.

The automation needs no custom body: the worker reads the triggering page id
from Notion's standard payload and fetches the post itself.

## What it creates

One Social Content page per post:

| Property | Value |
|---|---|
| Name | `Blog: <Post Title>` |
| Page body | the post's `Description` |
| Channel | `LIPAGE@work-flowers` |
| Type | Blog Post Reshare |
| Status | Ready to schedule (the scheduler picks it up from there) |
| Publication Date | 08:00 SGT on the next weekday after the blog's `Date` |
| `sc_title_article` | the post title |
| `sc_link_article` | the post's URL, tagged `utm_source=linkedin&utm_medium=social&utm_campaign=blog_reshare` |
| Blog Post | relation back to the post |

The URL is the post's `Public URL` when set, otherwise the blog address plus
its `Slug`.

## Behaviour

- **No duplicates.** If the post already has a company-page reshare linked, the
  event is skipped, so re-ticking Publish or a webhook retry is harmless.
  Reshares on other channels don't count.
- **No back-dated posts.** If 08:00 on the next weekday has already passed, it
  uses the next weekday after now instead.
- **Weekends only.** Public holidays aren't skipped.
- **Incomplete posts are skipped, not failed.** A post missing its title,
  description, date or slug is logged and left alone; the automation fires
  again on the next matching edit.

## Setup

`NOTION_API_TOKEN`: the shared `notion-worker-automations` integration, which
can read Blog Content and write Social Content.

```shell
cd workers/blog-social-reshare
ntn workers env set NOTION_API_TOKEN=...
```

## Develop and deploy

```shell
npm run check --workspace=notion-worker-blog-social-reshare
npm run test --workspace=notion-worker-blog-social-reshare
./scripts/deploy.sh blog-social-reshare
```

The scheduling rules live in `src/schedule.ts` and are covered by the tests.

More detail for maintainers is in [`CLAUDE.md`](CLAUDE.md).
