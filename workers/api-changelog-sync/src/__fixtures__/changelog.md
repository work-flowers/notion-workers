> ## Documentation Index
> Fetch the complete documentation index at: https://developers.notion.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Changelog

<Update label="June 25, 2026">
  ### Poll async MCP tool tasks with `notion-get-async-task`

  A new [`notion-get-async-task`](/guides/mcp/mcp-supported-tools) MCP tool returns the current status of an async task started by another tool, such as `notion-duplicate-page` or `notion-create-pages` when invoked with `allow_async: true`. The response carries a status of `queued`, `running`, `retrying`, `succeeded`, or `failed`; successful tasks include the operation's result, and failed tasks include an error. Pass the `task_id` from the originating tool's `async_task` response and wait briefly between polls — that response includes a suggested backoff.

  ### Get workspace and user identity with `notion-fetch`

  The [`notion-fetch`](/guides/mcp/mcp-supported-tools) MCP tool now accepts the special id `self`, returning the connected workspace and user identity instead of an entity. The response includes a `self` object with the workspace's ID and name and the authenticated user's ID, name, type, and email, letting MCP clients label a connection after OAuth without the public REST API. See [Integrating your own MCP client](/guides/mcp/build-mcp-client#identify-the-connected-workspace).
</Update>

<Update label="June 22, 2026">
  ### Your AI assistant now has a complete, consistent view of Notion

  We've expanded which Notion features are available when using AI assistants like Claude, ChatGPT, or any third-party agent connected to Notion via MCP.

  **Expanded access for Business + Notion AI plans**

  Teams on a Business plan with Notion AI can now query a single database or view directly from their AI assistant. This previously required Enterprise + Notion AI. Querying across multiple databases in a single query still requires Enterprise + Notion AI.

  **Your assistant always knows what's possible**

  Previously, if a Notion feature wasn't included in your plan, your AI assistant simply didn't know it existed. This sometimes led to bad outcomes. For example, your assistant might repeatedly try to search for database properties, unaware that the right tool simply wasn't visible to it.

  Now your assistant has a complete picture of what Notion can do. If a feature requires a higher plan, it will say so and point you toward an upgrade rather than silently attempting the wrong approach.

  ### Status option groups

  Status property option objects now accept an optional `group` field when creating or updating a database or data source schema. Use `group` to assign a custom status option to `To-do`, `In progress`, or `Complete`. When `group` is omitted on update, existing options keep their current group, and new options use `To-do` when present or the first existing group otherwise.
</Update>

<Update label="June 16, 2026">
  ### Workspace-level rate limits

  The Notion API now applies a rate limit per workspace, in addition to the existing [per-connection limit](/reference/request-limits). This limit is shared across all of a workspace's connections and scaled to the workspace's plan, so requests can be rate limited even when a single connection is within the per-connection limit. As with other rate limits, respect the `Retry-After` header on HTTP 429 responses. See [Request limits](/reference/request-limits).
</Update>

<Update label="June 10, 2026">
  ### Bots in people properties and user mentions

  Bots that appear as [user objects](/reference/user) in API responses can now be assigned to `people` [page property values](/reference/page-property-values#people) and referenced in `user` [rich text mentions](/reference/rich-text#user-mention-type-object). You can set a `people` property when you [create a page](/reference/post-page) or [update page properties](/reference/patch-page). Previously these writes returned a `validation_error`, even though the same bots were already returned when reading those fields. Some bots never appear as user objects, including integrations Notion uses internally to power features like database automations and custom agents. Assigning one of those still returns a `validation_error`.
</Update>

<Update label="June 8, 2026">
  ### Unique access tokens per OAuth authorization

  New public connections now mint a fresh `access_token` and `refresh_token` for each successful OAuth authorization instead of returning the existing active token. Existing connections keep their previous behavior. Store the token pair from every successful response — including re-authorizations of the same connection — as described in the [Authorization guide](/guides/get-started/authorization#step-5-the-connection-stores-the-access_token-and-refresh_token-for-future-requests).
</Update>

<Update label="May 15, 2026">
  ### Markdown page insertion positions

  The [Update page markdown](/reference/update-page-markdown) endpoint now supports `insert_content.position`, letting integrations prepend markdown to the start of a page or explicitly append it to the end without rewriting the full page. See [Working with markdown content](/guides/data-apis/working-with-markdown-content#legacy-commands) for examples.
</Update>

<Update label="May 12, 2026">
  ### Developer portal and personal access tokens

  The new [Developer portal](https://www.notion.so/developers) is now available as a single place to manage developer tools for Notion, including connections, Workers, and personal access tokens.

  [Personal access tokens](/guides/get-started/personal-access-tokens) (PATs) are user-scoped tokens for scripts, CLI workflows, Workers, and trusted tools that should act with one Notion user's permissions. PATs can be granted Notion API access, Workers access, or both.

  Workspace admins can now view and revoke PATs created in their workspace. On supported plans, admins can also configure who may create PATs with Notion API access. Defaults vary by plan: Free workspaces default to workspace owners only, Plus workspaces default to all workspace members, Business workspaces default to workspace owners only, and Enterprise workspaces default to workspace owners and selected groups.
</Update>

<Update label="May 11, 2026">
  ### Query meeting notes endpoint

  The new [Query meeting notes](/reference/query-meeting-notes) endpoint (`POST /v1/blocks/meeting_notes/query`) returns AI meeting notes for the integration's user with optional filter, sort, and limit. The `attendees` alias is normalized server-side so filters round-trip cleanly.

  ### `agent_id` parent type

  Pages and blocks parented by an agent now serialize their `parent` as `{ "type": "agent_id", "agent_id": "..." }` instead of being rejected or rewritten. See [Parent object](/reference/parent-object) for the full list of parent types.

  **SDK support**: `@notionhq/client` [`v5.21.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.21.0) adds typed support for `notion.blocks.meetingNotes.query()` and the `agent_id` parent variant.
</Update>

<Update label="April 22, 2026">
  Improvements to pagination reliability for the [Query a data source](/reference/post-database-query) endpoint:

  * Pagination cursors now embed a session identifier, eliminating intermittent `400 validation_error` ("The start\_cursor provided is invalid") errors that could occur when multiple pagination sessions for the same query overlapped.
  * The `start_cursor` parameter now accepts opaque string values in addition to UUIDs. Existing UUID-based cursors continue to work. As documented in our [versioning policy](/reference/versioning), cursors should always be treated as opaque — pass `next_cursor` values back as `start_cursor` without parsing or validating their format.
</Update>

<Update label="April 20, 2026">
  ### Data source and view query pagination limit

  The [Query a data source](/reference/query-a-data-source), [Create a view query](/reference/create-view-query), and [Get view query results](/reference/get-view-query-results) endpoints now enforce a maximum pagination depth of 10,000 results per query. When a query matches more rows than this limit, the response includes a new `request_status` field:

  ```json theme={null}
  {
    "request_status": {
      "type": "incomplete",
      "incomplete_reason": "query_result_limit_reached"
    }
  }
  ```

  Integrations that polled these endpoints to iterate through all matching rows in a large data source should check for `request_status.type === "incomplete"` and adapt accordingly. The limit improves reliability for all API users by bounding the server-side resources consumed by each query.

  If your integration needs to process all pages in a large data source, we recommend:

  * Using [data source filters](/reference/filter-data-source-entries) or narrowing the [view's filter/sort configuration](/reference/update-a-view) to reduce the result set (for example, filter by `last_edited_time` to only fetch recently changed pages).
  * Setting up [integration webhooks](/reference/webhooks) for incremental sync instead of polling the full data source on a schedule.
  * Dividing large data sources into multiple smaller ones.

  **SDK support**: `@notionhq/client` [`v5.20.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.20.0) adds typed support for the `request_status` field on affected list responses.
</Update>

<Update label="April 17, 2026">
  ### Update and delete comment endpoints

  The [Update a comment](/reference/update-a-comment) (`PATCH /v1/comments/:comment_id`) and [Delete a comment](/reference/delete-a-comment) (`DELETE /v1/comments/:comment_id`) endpoints are now generally available. Non-DLP integrations can only modify or delete comments they created.

  ### Multi-value filters for select, status, and multi\_select properties

  [Database](/reference/post-database-query-filter) and [data source](/reference/filter-data-source-entries) filters now accept an array of values for `equals` / `does_not_equal` on select and status properties, and for `contains` / `does_not_contain` on multi\_select properties, matching the multi-value conditions available in the Notion UI. The same schema is used by [view filters and quick filters](/guides/data-apis/working-with-views#quick-filters). Person filters set via the API also now round-trip cleanly on read without extra combinator nesting.

  ### Notion MCP improvements

  * The [`search`](/guides/mcp/mcp) tool no longer drops Slack DMs and private channel results when the connected workspace has the Slack integration enabled.
  * The [`fetch`](/guides/mcp/mcp) tool now accepts any first-party Notion domain for the current environment (both `notion.so` and `notion.com`), fixing cases where pasted links fell through as generic webpages.
  * Page resources returned by the `fetch` tool now include `is_archived` so agents can tell when a page is in the trash.
  * The enhanced Markdown guidance the MCP presents to LLMs now documents `<br>` as the correct way to break lines inside inline code, preventing retry loops when agents write multi-line inline code via `update_page`.
  * The Notion MCP OAuth server adds [Client ID Metadata Document (CIMD)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document) support per [MCP spec 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25), letting clients use an HTTPS URL as their `client_id` instead of going through Dynamic Client Registration.

  ### Comment markdown formatting clarification

  The [Create a comment](/reference/create-a-comment) and [Update a comment](/reference/update-a-comment) references now explicitly document that the `markdown` body parameter supports inline formatting only — fenced code blocks, headings, lists, tables, and blockquotes do not render as structured blocks in comments.

  **SDK support**: `@notionhq/client` [`v5.18.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.18.0) adds typed support for multi-value select, status, and multi\_select filters. [`v5.19.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.19.0) adds `notion.comments.update()` and `notion.comments.delete()`.
</Update>

<Update label="April 7, 2026">
  ### Markdown body parameter for comments

  The [Create comment](/reference/create-a-comment) endpoint now accepts an optional `markdown` string body parameter as an alternative to `rich_text`. Exactly one of `rich_text` or `markdown` must be provided. See the [endpoint reference](/reference/create-a-comment#comment-body-format) for supported formatting and usage details.

  **SDK support**: `@notionhq/client` [`v5.17.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.17.0) includes typed support for the `markdown` comment body parameter.
</Update>

<Update label="April 2, 2026">
  ### What's new

  The [Developer Terms](https://www.notion.so/notion/Developer-Terms-ba4131408d0844e08330da2cbb225c20) have been updated with clarifications to scope, revisions to the Feedback provision, and other minor revisions.
</Update>

<Update label="March 30, 2026">
  ### Heading 4 block type

  [`heading_4`](/reference/block#headings) is now a supported block type. You can create, read, and update heading 4 blocks through the [Append block children](/reference/patch-block-children), [Retrieve a block](/reference/retrieve-a-block), and [Update a block](/reference/update-a-block) endpoints, matching the existing `heading_1`, `heading_2`, and `heading_3` block types.

  ### Tab item icons

  [Paragraph blocks](/reference/block#paragraph) that are direct children of [tab blocks](/reference/block#tab) now support an optional [`icon`](/reference/emoji-and-icon) field. You can set icons on tab items when creating tabs via [Append block children](/reference/patch-block-children) or [Create a page](/reference/post-page), and update them via [Update a block](/reference/update-a-block). Icons on paragraphs that are not tab items are rejected with a validation error.

  ### "me" relative filter for people properties

  [People filter conditions](/reference/filter-data-source-entries#people) now accept `"me"` as a value for `contains` and `does_not_contain`, in addition to user UUIDs. For [public integrations](/guides/get-started/overview#connection-types), `"me"` resolves to the user who authorized the connection. For [internal integrations](/guides/get-started/overview#connection-types), `"me"` does not resolve to a user — a `contains: "me"` filter will return no results and a `does_not_contain: "me"` filter will match all entries. Works across [database queries](/reference/post-database-query-filter#people), [data source queries](/reference/filter-data-source-entries#people), [view filters, and quick filters](/guides/data-apis/working-with-views#quick-filters).

  ### Relative date filter values

  Date filter conditions that accept an [ISO 8601 date](https://en.wikipedia.org/wiki/ISO_8601) string (`equals`, `before`, `after`, `on_or_before`, `on_or_after`) now also accept the following relative date values: `"today"`, `"tomorrow"`, `"yesterday"`, `"one_week_ago"`, `"one_week_from_now"`, `"one_month_ago"`, `"one_month_from_now"`. These are resolved at query time relative to the current date. See the [date filter reference](/reference/filter-data-source-entries#date) for details.

  ### View API fixes

  Several fixes to the [views API](/guides/data-apis/working-with-views):

  * **Percent-encoded property IDs**: Property IDs returned by the API (e.g. `%7DUlu`) are now correctly resolved when used in view filters, sorts, group-by, and other property references.
  * **`width: 0` rejected**: Column widths must now be at least `1`. A width of `0` was previously accepted but had no effect.
  * **Partial `properties` list**: Specifying a subset of properties in a view now correctly hides unlisted properties instead of showing all properties.

  **SDK support**: `@notionhq/client` [`v5.16.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.16.0) includes typed support for heading 4, tab item icons, and the `"me"` person filter value.
</Update>

<Update label="March 25, 2026">
  ### Tab block support

  [Tab blocks](/reference/block#tab) are now a supported block type in the API. Use tabs to organize content into labeled sections within a page.

  * **Read**: [Retrieve a block](/reference/retrieve-a-block) and [Retrieve block children](/reference/get-block-children) return tab blocks with `type: "tab"` and an empty `tab: {}` object. Each tab within the container is a [paragraph](/reference/block#paragraph) block — the `rich_text` is the tab label, the `icon` is the tab icon, and the `children` contain the tab's content.
  * **Create**: [Append block children](/reference/patch-block-children) accepts `type: "tab"` blocks. Each tab is a paragraph block with nested children and an optional `icon`. Only paragraph blocks can be direct children of a tab block.

  ### Writable verification property

  The [`verification`](/reference/page-property-values#verification) property on wiki database pages can now be set and updated via the [Create page](/reference/post-page) and [Update page](/reference/patch-page) endpoints. Set `state` to `"verified"` or `"unverified"`, with an optional `date` object for expiration. The `verified_by` field is automatically set to the acting integration and cannot be overridden.

  ### Native icons and custom emoji listing

  Two icon-related improvements:

  * **Native Notion icons**: A new `type: "icon"` variant is available on all [`icon`](/reference/emoji-and-icon#icon) fields (pages, databases, callout blocks). Specify an icon by `name` and optional `color` (defaults to `"gray"`). Previously, native icons were returned as `type: "external"` with SVG URLs — they are now returned in the structured `icon` format.
  * **Custom emoji listing**: A new [List custom emojis](/reference/list-custom-emojis) endpoint (`GET /v1/custom_emojis`) retrieves workspace custom emojis with cursor pagination and an optional `name` filter for exact-match lookups.

  **SDK support**: `@notionhq/client` [`v5.15.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.15.0) adds `notion.customEmojis.list()` and typed support for tab blocks, verification writes, and native icons.
</Update>

<Update label="March 19, 2026">
  ### Views API

  We've launched the [`/v1/views` API](/guides/data-apis/working-with-views). Eight new endpoints let integrations programmatically manage database views — the same view presets that users create in the Notion UI:

  * [Create](/reference/create-view), [retrieve](/reference/retrieve-a-view), [update](/reference/update-a-view), and [delete](/reference/delete-view) views on any database.
  * [List views](/reference/list-views) for a database or across the workspace by data source.
  * [Query a view](/reference/create-view-query) to fetch pages using the view's saved filter and sort configuration, with [pagination](/reference/get-view-query-results) support.

  [Supported view types](/guides/data-apis/working-with-views#view-configuration) include table, board, calendar, timeline, gallery, list, form, chart, map, and dashboard. Views can be configured with filters, sorts, [quick filters](/guides/data-apis/working-with-views#quick-filters), and type-specific layout settings like grouping, cover images, subtasks, and chart options.

  Dashboard views support a full grid layout with [widget placement](/guides/data-apis/working-with-views#widget-placement) — add, position, and remove widget views within rows.

  Three new [webhook events](/reference/webhooks/view-created) (`view.created`, `view.updated`, `view.deleted`) are available on API version `2025-09-03` and later.

  **SDK support**: `@notionhq/client` [`v5.14.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.14.0) adds `notion.views.*` and `notion.views.queries.*` methods.

  ### Status property support

  You can now [create and update status properties](/reference/property-object#status) through the Notion API and [Notion MCP](/guides/mcp/mcp). Previously, status properties were read-only — they could be queried but not created or modified via the API.

  * **Create**: pass `{ status: {} }` in a [Create database](/reference/create-database) or [Create data source](/reference/create-a-data-source) request to add a status property with default options (Not started, In progress, Done). Custom initial options are also supported.
  * **Update**: add new options to an existing status property via [Update data source](/reference/update-a-data-source), following the same pattern as select and multi\_select.
  * **MCP**: the `notion-create-database` and `notion-update-data-source` tools now support the `STATUS` column type in their schema definitions.
</Update>

<Update label="March 11, 2026">
  ### New API version: `2026-03-11`

  We've released **Notion API version `2026-03-11`** with three breaking changes that simplify and modernize the API surface:

  * **`after` replaced by `position`**: The [Append block children](/reference/patch-block-children) endpoint now uses a `position` object instead of a flat `after` string parameter, enabling more flexible block placement (including `start` and `end` positioning).
  * **`archived` replaced by `in_trash`**: All endpoints now use `in_trash` instead of `archived` in both request parameters and response bodies. The `archived` field was [deprecated in April 2024](/page/changelog#changes-for-april-2024) and is now fully removed in this version.
  * **`transcription` renamed to `meeting_notes`**: The `transcription` block type has been renamed to `meeting_notes` across all block endpoints.

  Most integrations only need simple find-and-replace updates. See the [upgrade guide](/guides/get-started/upgrade-guide-2026-03-11) for step-by-step instructions.

  **SDK support**: `@notionhq/client` [`v5.12.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.12.0) adds support for `2026-03-11`. Upgrade the SDK and set `notionVersion: "2026-03-11"` to opt in.

  ### Notion MCP: new view tools

  Two new tools are available in [Notion MCP](/guides/mcp/mcp):

  * **`notion-create-view`** — Create new database views with filters, sorts, grouping, display properties, and layout-specific settings (calendar, timeline, etc.).
  * **`notion-update-view`** — Update an existing view's configuration. Accepts `view://` URIs, Notion URLs with `?v=`, or bare UUIDs.

  See [Supported tools](/guides/mcp/mcp-supported-tools) for details and example prompts.

  ### Markdown content API improvements

  The [Update page markdown](/reference/update-page-markdown) endpoint now supports two additional command types:

  * **`update_content`** — Make targeted edits with an array of search-and-replace operations (`old_str` / `new_str`). Recommended for precise, multi-site edits.
  * **`replace_content`** — Replace the entire page content with new markdown in a single operation.

  We recommend `update_content` and `replace_content` over the older `insert_content` and `replace_content_range` commands. See [Working with markdown content](/guides/data-apis/working-with-markdown-content) for usage examples.

  ### Template timezone parameter

  The [Create page](/reference/post-page) and [Update page](/reference/patch-page) endpoints now accept an optional `timezone` field inside the `template` parameter. This controls how template variables like `@now` and `@today` resolve — for example, `"America/New_York"` ensures dates reflect Eastern Time instead of defaulting to UTC. See the [Creating pages from templates](/guides/data-apis/creating-pages-from-templates) guide for details.
</Update>

<Update label="March 2, 2026">
  * The [`GET /v1/pages/:page_id/markdown`](/reference/retrieve-page-markdown) endpoint is now available to **internal integrations** (workspace-level bots), in addition to public integrations.
  * Released [`v5.11.1`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.11.1) of our TS/JS SDK. `UnsupportedBlockObjectResponse` now includes a `block_type` string field indicating the underlying block type.
</Update>

<Update label="February 26, 2026">
  We released [`v5.10.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.10.0) and [`v5.11.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.11.0) of our SDK for JavaScript and TypeScript. Here's what's new in the Notion API:

  ### Markdown content API

  Three new endpoints let you create, read, and update page content using [enhanced markdown](/guides/data-apis/enhanced-markdown) instead of the block-based API:

  * [`POST /v1/pages`](/reference/post-page) now accepts a `markdown` parameter as an alternative to `children`.
  * [`GET /v1/pages/:page_id/markdown`](/reference/retrieve-page-markdown) retrieves a page's full content as enhanced markdown.
  * [`PATCH /v1/pages/:page_id/markdown`](/reference/update-page-markdown) inserts or replaces content using enhanced markdown with ellipsis-based selections.

  See [Working with markdown content](/guides/data-apis/working-with-markdown-content) and the [Enhanced markdown format reference](/guides/data-apis/enhanced-markdown) for details.

  ### AI meeting notes

  * The `GET /v1/pages/:page_id/markdown` endpoint supports an `include_transcript` query parameter to include full meeting note transcripts in the response.
  * Added support for the [`transcription` block type](/reference/block#transcription), enabling integrations to read AI meeting notes metadata — including title, status, calendar event details, and pointers to summary, notes, and transcript content blocks.

  ### SDK improvements

  * **Automatic retry with exponential backoff** — the SDK now retries failed requests automatically with configurable backoff ([v5.10.0](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.10.0)).
  * **Markdown endpoint methods** — `pages.retrieveMarkdown()` and `pages.updateMarkdown()` ([v5.11.0](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.11.0)).

  ### Notion MCP improvements

  Highlighting recent changes to [Notion MCP](https://developers.notion.com/docs/mcp):

  * Create and fetch **comments on blocks**, not just pages.
  * View **Notion Sites** pages via the fetch tool.
  * Fetch AI **meeting transcripts** and query meeting notes efficiently with the new `notion-query-meeting-notes` tool.
  * Fetch an **individual data source** by ID or URL within a database.
  * **\~91% context token reduction** in `notion-create-database` and `notion-update-data-source` tools by switching to SQL DDL-based schemas.
  * Added `update_verification` command to the `notion-update-page` tool.
  * Flattened `notion-update-page` tool parameters and fixed schema issues for improved compatibility with MCP clients.
  * **Enterprise governance**: audit logging for MCP tool usage and admin tool allowlisting.

  We recommend reconnecting Notion MCP in your third-party AI tools to ensure you have the most up-to-date tools and resources.
</Update>

<Update label="January 15, 2026">
  We [released `v5.7.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.7.0) of our SDK for JavaScript and TypeScript. Since the last changelog entry, we've added the following fixes and improvements to the Notion API:

  * Introduce [Move page](/reference/move-page) API to change the `parent` of an existing page.
  * TS/JS example projects extracted to a new open-source project: [`notion-cookbook`](https://github.com/makenotion/notion-cookbook/tree/main/examples).
  * Add support for [customizing the `position` of a new page](https://developers.notion.com/reference/post-page#choosing-a-parent) within the parent page.
  * New APIs to power the flow described in our [Creating pages from templates](/guides/data-apis/creating-pages-from-templates) guide:
    * Introduce [List data source templates](/reference/list-data-source-templates) endpoint.
    * Introduce [`template` parameter](https://developers.notion.com/reference/post-page#setting-up-page-content) to Create Page API.
    * Introduce [`template`](https://developers.notion.com/reference/patch-page#applying-a-page-template) and [`erase_content` parameters](https://developers.notion.com/reference/patch-page#erasing-content-from-a-page) to Update Page API.

  Highlighting recent LLM-facing changes to [Notion MCP](https://developers.notion.com/docs/mcp), our remote Model Context Protocol (MCP) server for AI tools:

  * Released `notion-query-data-sources` tool to Enterprise Notion workspaces with access to Notion AI.
  * Tool consolidation: `notion-get-user` has been removed & its functionality has been rolled into `notion-get-users`.
  * Fixed a bug causing child content to be deleted by the `notion-update-page` tool when using `replace_content` and `replace_content_range` modes.
  * Removed Notion-flavored Markdown specification from `notion-create-pages` tool to conserve context tokens, since it exists behind a dedicated MCP Resource as well.

  We recommend reconnecting Notion MCP in your third-party AI tools to ensure you have the most up-to-date tools and resources.
</Update>

<Update label="September 13, 2025">
  We [released `v5.1.0`](https://github.com/makenotion/notion-sdk-js/releases/tag/v5.1.0) of `@notionhq/client`, our SDK for JavaScript and TypeScript. This includes the following fixes and improvements:

  * Add support for `is_locked` boolean parameter on update page and database APIs (to update whether a page is locked in the Notion app UI)
  * `dataSource.update`: add support for changing a data source's `parent` database
  * Remove `page_id` as a possible `parent` for `CreateDataSourceBodyParameters`
  * Add `request_id` to Client log lines

  As noted in the [library's README](https://github.com/makenotion/notion-sdk-js?tab=readme-ov-file#requirements-and-compatibility), v5 and above of the SDK isn't compatible with API versions older than `2025-09-03`. See the [upgrade guide](/guides/get-started/upgrade-guide-2025-09-03) to learn more.
</Update>

<Update label="August 26, 2025">
  ### Important API update coming September 3rd

  We're introducing multi-source databases to Notion! Our new API version `2025-09-03` separates "**databases**" (containers) from "**data sources**" (tables), unlocking powerful new organizational capabilities.

  ### What you need to know:

  * Current integrations continue working with single-source databases
  * Update to the new API version to support multi-source databases
  * We're introducing the concept of API versioning to [integration webhooks](/reference/webhooks) as well

  Start upgrading your integrations now to ensure a smooth transition when users begin creating additional data sources starting from September 3rd.

  **Full details and migration guide**: [Upgrading to 2025-09-03](/guides/get-started/upgrade-guide-2025-09-03)

  **General information about API versioning**: [Versioning](/reference/versioning)
</Update>

<Update label="December 20, 2024">
  ### What's new

  * Revised **Section 1.1** to refine the scope of application of the [Developer Terms](https://www.notion.so/Developer-Terms-ba4131408d0844e08330da2cbb225c20).
  * Revised **Section 3.1** to clarify prohibited uses of the API and created a new **Section 3.2** for formatting purposes
</Update>

<Update label="September 11, 2024">
  ### What's new

  We are excited to announce an update to our Notion Public API token format.

  Starting September 25, 2024, newly generated Public API tokens will automatically use the **`ntn_`** prefix instead of the\*\*`secret_`\*\* prefix.

  ### Why the change?

  This change is part of our ongoing efforts to improve the security of our API. By introducing the **`ntn_`** prefix, we aim to:

  * Enhance compatibility with secret scanners and other security tools, making it easier to identify and manage Notion API tokens.
  * Provide a clearer distinction between Notion API tokens and other types of secrets, reducing the risk of misconfiguration and improving overall security.

  ### What do you need to do?

  * New Integrations: For any new integrations, the tokens will be automatically generated with the **`ntn_`** prefix. Simply generate your tokens as usual through the Notion API settings page.
  * Existing Tokens: All existing tokens with the secret\_ prefix will continue to work without any changes. There is no immediate need to update your existing integrations.
  * Token Format: We strongly advise against using regular expressions (regex) to identify or validate Notion Public API tokens. The token format may change over time, and relying on regex patterns could lead to false positives or negatives. Instead, treat the token as an opaque string and use it as provided.
  * Best Practices: To handle Notion API tokens securely:
    * Store tokens securely using appropriate encryption methods.
    * Use Notion's official SDKs or libraries when available, as they handle token management correctly.
    * Validate tokens by making authenticated requests to Notion's API rather than parsing the token itself.

  ### Questions or concerns?

  If you have any questions or need assistance with this transition, please feel free to reach out to our support team or visit our docs.
</Update>

<Update label="September 9, 2024">
  ### What's new

  Revised **Section 3.1** of the [Developer Terms](https://www.notion.so/Developer-Terms-ba4131408d0844e08330da2cbb225c20) to include additional security and data use restrictions.
</Update>

<Update label="Changes for April 2024">
  ### What's new

  * Added: New property `in_trash` to indicate whether a page/block/database has been deleted or placed in "Trash".
  * `in_trash` is the preferred field going forward. The `archived` property is a deprecated alias for `in_trash` and may be removed in a future API version. New integrations should use `in_trash` exclusively.
</Update>

<Update label="Changes for November 27 - December 10, 2023">
  ### What's new

  * We added support for reading and writing names to `file` blocks in the public API. Read more here.
  * We fixed the types in the SDK to support appending `table` and `column` blocks as children of `toggle` blocks.
  * We updated the emoji and timezones available in the SDK.
  * We added support for `australian_dollar` in the `format` field of number database properties.
</Update>

<Update label="September 8 - September 21, 2023">
  ### What's new

  * The [Examples](/page/examples) page was updated with all our most recent demo code. We've organized these sample integrations by level of experience with the Public API to help developers who are newer to the Public API find introductory code more easily.
  * A note was added to all API endpoint documentation directing developers to review the [Status codes](/reference/status-codes#error-codes) page for a complete list of error codes that can be returned by API requests.
  * A clarification was added to the [Request limits](/reference/request-limits) page and [Append block children endpoint](/reference/patch-block-children) documentation to indicate the current limit for appending a list of block children per API request. Up to 100 block children can be appended at a time.
</Update>

<Update label="September 6 - September 7, 2023">
  ### What's new

  * The [updates](/page/changelog#notice-for-an-upcoming-public-api-change) related to the [Formulas 2.0 launch](https://twitter.com/NotionHQ/status/1699828805408550971?s=20) are now live in the Public API. These changes will not impact most developers using the Public API; however, please note that the formatting of [`formula.expression`](/reference/property-object#formula), which is returned when [retrieving a database](/reference/retrieve-a-database) with a [Formula property](/reference/property-object#formula), has changed. See Notion's Help Center articles for more information on the Formula 2.0 changes:
    * [Formulas 2.0: How to use Notion's new and improved formulas with your existing setups](https://www.notion.so/help/guides/new-formulas-whats-changed)
    * [How to write Notion formulas that extend the capabilities of your databases](https://www.notion.so/help/guides/write-formulas-that-extend-capabilities-of-databases)
  * The example for the [Formula database property](/reference/property-object#formula) was updated to align with the new Formula 2.0 launch.
  * [New sample code](https://github.com/makenotion/notion-cookbook/tree/main/examples/javascript/intro-to-notion-api) was added to the [Notion SDK for JavaScript's `examples`](https://github.com/makenotion/notion-cookbook/tree/main/examples/javascript) directory. This new example demonstrates how to use the Public API with basic and intermediate levels of difficulty.
</Update>

<Note>
  **Looking for older updates?**

  Changelog entries from before September 2023 are now kept in a separate page: [Historical changelog](/guides/resources/historical-changelog).
</Note>
