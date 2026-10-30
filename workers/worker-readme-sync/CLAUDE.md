# worker-readme-sync — worker context


Syncs one row per `workers/<dir>` on GitHub `main` into the managed **Notion Workers** database (`readmeSync`, replace mode, every 12h): README as page body, `workers.json` → Worker ID / Deployed, `src/index.ts` → Capabilities, directory commit history → Created / Last Updated / Updated By.

## No `upstreamUpdatedAt` (removed 2026-10-30)

The upsert used to pass `upstreamUpdatedAt` = the directory's latest commit **author** date. Notion skips any upsert whose timestamp isn't newer than the last one applied to that row, even when the properties differ, and still counts it as an upsert. That silently dropped real updates here:

- Author dates aren't monotonic on `main`: a PR authored earlier but merged after another one carries an *older* date, so its README/capability changes never landed.
- Page content goes through `toNotionMarkdown` in `packages/shared`; a fix there changes every page body without touching any worker directory's commit date.
- Any mapping change in this file (new capability detection, new property) is likewise invisible to the timestamp.

Only one sync writes this database, so the field guarded against nothing. Don't reintroduce it.
