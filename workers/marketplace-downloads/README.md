# marketplace-downloads

Records every Notion Marketplace acquisition of our templates (paid purchases,
free downloads and refunds) as a row in the **Marketplace Downloads**
database under Company Home.

## How it's triggered

The Marketplace sends a webhook for each purchase and refund. Register this
worker's `onMarketplaceEvent` URL as the **Webhook URL** in the Marketplace
creator profile (Settings). Get the URL with `ntn workers webhooks list` from
the worker's directory.

The Marketplace doesn't sign its webhooks, so the URL is the only thing
keeping others out: treat it as a secret. Webhooks are only available to
verified sellers.

## What it records

One row per acquisition, keyed by the Marketplace's acquisition id:

- **Purchase:** a new row with status `Acquired`: the template and its type,
  slug, customer email and opt-in, listing, discounted and paid prices, tax,
  seller payout, coupon, source, locale and acquisition time. The raw webhook
  payload is kept in the page body. A retried purchase is skipped.
- **Refund:** the existing row is marked `Refunded` with the refund time and
  reason. If the purchase was never recorded, a `Refunded` row is created.

Prices arrive in cents and are stored in dollars.

The database was made by hand rather than by the worker, so every column
stays editable. New products, types, sources and locales become select
options automatically.

## Behaviour

- **Anything that isn't a purchase or refund is ignored.** That includes the
  creator profile's **Test** button, so testing the webhook adds no rows. It's
  logged, not rejected: rejecting five deliveries in a row would switch the
  webhook off until the next deploy.
- **Free downloads:** the Marketplace docs don't say whether free templates
  send a purchase webhook. Check after the first free download.

## Setup

`NOTION_API_TOKEN`: the shared `notion-worker-automations` integration, which
has access to the Marketplace Downloads database.

```shell
cd workers/marketplace-downloads
ntn workers env set NOTION_API_TOKEN=...
```

## Develop and deploy

```shell
npm run check --workspace=notion-worker-marketplace-downloads
npm run test --workspace=notion-worker-marketplace-downloads
./scripts/deploy.sh marketplace-downloads
```

The payload parsing and column mapping live in `src/payload.ts` and are
covered by the tests.

More detail for maintainers is in [`CLAUDE.md`](CLAUDE.md).
