# marketplace-downloads

Webhook worker: records every Notion Marketplace acquisition of our templates (paid purchases, free downloads, refunds) as one row in **Marketplace Downloads** (under Company Home).

## Trigger

Capability `onMarketplaceEvent` (`worker.webhook`). Register the URL from `ntn workers webhooks list` as the **Webhook URL** in the Marketplace creator profile (app.notion.com/profile → Settings). Treat the URL as a secret — the Marketplace does not sign its webhooks, so the URL is the only auth. Webhooks require being a verified seller.

Payload reference: https://www.notion.com/help/selling-on-marketplace#webhooks. Events are `marketplace.purchase` and `marketplace.refund`, both keyed by `acquisitionId`. The docs spell the event field `Event` (capital E); `event` is accepted too.

## Data source

| | id |
|---|---|
| Marketplace Downloads | `cc62edf4-080d-419f-ba03-3065168763f3` (database `c9b0c09e-11ce-4312-8088-298cfda7f54e`) |

Created by hand (not `worker.database()`), so every column stays editable. Money fields arrive in cents and are stored in dollars. `Product`, `Product Type`, `Source` and `Locale` are selects whose options the API creates on first write (commas are stripped from option names).

## Behaviour notes

- **Purchase**: creates a row (Status `Acquired`) with the raw payload as a JSON code block in the body. A retried purchase with an existing `Acquisition ID` is skipped.
- **Refund**: sets Status `Refunded`, `Refunded At`, `Refund Reason` (`refundReason: customRefundReason`) on the existing row; if none exists, creates a `Refunded` row.
- Bodies without an `acquisitionId` or with another event type (e.g. the profile's **Test** button, whose payload is undocumented) are logged and ignored, never thrown — throwing `WebhookVerificationError` five times in a row would short-circuit the webhook until redeploy.
- Whether free templates fire `marketplace.purchase` is not stated in the docs ("whenever their templates are sold or refunded"); confirm from the first free download.
- Mapping logic lives in `src/payload.ts`; `npm test --workspace=notion-worker-marketplace-downloads`.

## Deployment

- Worker id `01a18abc-11a1-7a24-8f89-2c294bce7e63`, first deployed 2026-10-30.

## Env

`NOTION_API_TOKEN` — the `notion-worker-automations` integration (1Password: `op://Employee/notion-worker-automations/credential`), which already has access to the Marketplace Downloads database.
