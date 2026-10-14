# notion-worker-luma-buildbar-sg

A [Notion Worker](https://developers.notion.com/workers/get-started/overview.md) that syncs registrations for **Notion Build Bar Singapore** (22 Oct 2026, [luma.com/buildbar-sg-oct](https://luma.com/buildbar-sg-oct), event `evt-WCXl3pOH3lRap1F`) from the NotionSG Luma calendar into a Notion database.

Every 15 minutes, `buildBarSgGuestsSync` pulls every guest from Luma's List Guests endpoint (`GET /v1/events/guests/list`) and writes them to a Worker-managed database titled **Build Bar SG Registrations**, keyed on Guest ID. The sync runs in replace mode, so guests removed on Luma are also removed from Notion.

This is a one-event fork of [`luma-api-sync`](../luma-api-sync). The event ID is a constant in [src/index.ts](src/index.ts), not an env var, because the registration questions are hard-coded against it.

## What gets synced

| Notion property | Source |
|---|---|
| Name (title) | `user_name`, falling back to first + last name, then `(no name)`. Never an email: a name containing `@` is skipped |
| Guest ID (primary key), User ID | `id`, `user_id` |
| First Name, Last Name | `user_first_name`, `user_last_name` |
| Approval Status (select) | `approval_status` |
| Registered At, Invited At, Joined At | `registered_at`, `invited_at`, `joined_at` |
| Check-in QR Code | `check_in_qr_code` |
| UTM Source / Medium / Campaign / Content | `utm_source`, `attribution_params.utm_*` |
| Ticket Names, Ticket Count, Checked In, Checked In At | `event_tickets`, flattened. Monetary fields are ignored because the event is free |

**Registration answers** are un-nested into one property per question, matched on Luma's `question_id`:

| Notion property | Type | Question (`question_id`) |
|---|---|---|
| Company, Job Title | text | What company do you work for? (`nhidmktb`). Luma's `company` question returns `{company, job_title}`, split into two columns |
| Notion Plan | select | What type of Notion plan are you on? (`ialukd7h`) |
| Notion Experience | select | How would you rate your experience level with Notion? (`mve7yzuu`) |
| Reason for Attending | multi-select | Why do you want to come to Build Bar? (`lxz8zp1m`). Since removed from the form, but early registrants answered it |
| Help Needed | text | What would you need help with building? (`r3ba361b`) |
| 1:1 Time Slot | select | Requested time slot for 1:1 help (`q8yif6jr`). Includes the retired `6:30-7:00PM` slot |
| Marketing Consent | checkbox | Terms and Conditions (`tmt4xyku`), Notion marketing opt-in |

**Email addresses and phone numbers are not synced** (PII). That covers `user_email`, `phone_number` and the "What email do you use for Notion?" answer (`1uc5woee`). Removing a property from `worker.database()` leaves the column and its values in Notion, so if one is ever synced by mistake, delete the column too (`PATCH /v1/data_sources/{id}` with the property set to `null`).

Most guests were added by invite, so they have no answers yet. Their answer columns stay empty until they register.

## Setup

The API key is the `luma-notionsg` item in the **workFlowers** 1Password account (vault *Marketing*), not the personal account:

```bash
op read --account work-flowers.1password.com "op://Marketing/luma-notionsg/credential" \
  | xargs -I{} ntn workers env set LUMA_API_KEY={}
```

## Deploy & operate

From the repo root:

```bash
npm run check --workspace=notion-worker-luma-buildbar-sg
./scripts/deploy.sh luma-buildbar-sg
```

From `workers/luma-buildbar-sg`:

```bash
ntn workers sync trigger buildBarSgGuestsSync --preview  # inspect output without writing
ntn workers sync trigger buildBarSgGuestsSync            # force an immediate real run
ntn workers sync status
```

## Rate limits and cost

Luma allows 200 requests/minute per calendar API key and returns at most 50 guests per page, whatever `pagination_limit` asks for. The pacer is set to 100 requests/minute. The key is shared with anything else on the NotionSG calendar, and Luma returns 429s when calls arrive in bursts.

Worker credits are charged per execution (about 0.2 each), not per API call. So one execution fetches every page, up to 20 pages or about 1,000 guests, and writes them in a single batch. A run over the roughly 250 guests costs about 0.25 credits, about 24 a day at the 15-minute schedule. When it fetched one page per execution, the same run took 5 executions and about 1.15 credits.

## When the event's questions change

Answers to a `question_id` that isn't mapped are dropped without warning. To find a new question's ID, run `GET /v1/event/get?id=evt-WCXl3pOH3lRap1F` and read `registration_questions`, then add it to `Q`, the schema and `answerProperties` and redeploy. A reworded question needs no change. A new select option is created automatically the first time someone picks it.

After the event, disable the sync (`ntn workers capabilities disable buildBarSgGuestsSync`) so it stops polling.
