# ZapConnect 2026 Solution Partner submission

Submitted 2026-07-03 via https://sp-submissions-zapconnect-26.zapier.app/page

An application to be featured in the Solution Partner Use Case Showcase at ZapConnect 2026 (23 Sept). Selected builds are featured in the session and published to the ZapConnect GitHub repo with a "book a call" CTA. Submission does not guarantee a slot.

## What was submitted

- **Name / company / email:** Dennis Chiuten, work.flowers, dennis@work.flowers
- **Template:** "I'll submit my own Enterprise use case" (this build didn't match the five offered templates)
- **Built with:** SDK (Zapier SDK, not MCP)
- **Before → after:** "Running a warehouse query monthly and hand-pasting client profitability into Notion → a Notion Worker that runs the BigQuery report via the Zapier SDK and syncs effective hourly rate per client into a Notion database."
- **Cost hook:** "Replaces Tableau licences bought just to look at warehouse reports — the Zapier SDK runs the BigQuery query and lands the results in Notion, where the team already works. No BI seats, no OAuth plumbing, no infrastructure."
- **Template link:** https://github.com/work-flowers/notion-worker-bq-sync
- **Video walkthrough:** 2–4 min screen recording, was still to be recorded at submission time
- **Booking CTA:** "Want your warehouse data flowing into Notion? Book a call: https://www.work.flowers/meet-dennis"
- **Public featuring consent:** Yes

## Notes

- Form fields "before → after" and "cost hook" are capped at 255 characters.
- Positioning: the expensive thing replaced is Tableau (BI seats), not the warehouse — BigQuery *is* the warehouse; the value is surfacing its output in Notion where people already work.
- Dennis okayed the repo publicly exposing Xero account codes (200/201) and the `workflowers-analytics` project ID.
- Demo video outline suggested: problem (profitability data in BQ, team in Notion) → show the synced Notion database → walk through `src/index.ts` highlighting `zapier.runAction` on the BigQuery connector → live `ntn workers sync trigger effectiveRatesSync` → mention headless client-credentials auth.
