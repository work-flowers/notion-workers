# follow-up-tools

A [Notion Worker](https://developers.notion.com/workers) that gives the **Meeting Follow-up Tasks** Custom Agent two tools for turning meeting notes into tasks without creating duplicates. The agent still reads the meeting and proposes follow-ups. The tools make the two judgement calls it used to make by eye: *is this really a task?* and *does it already exist?*. Both use [Jev](https://docs.typesafe.ai), TypeSafe's typed-judgement model.

Tools only: no syncs, webhooks or databases. The worker never writes to Notion; the agent creates and updates the pages.

## How the agent uses it

```
meeting summary completed
  └─ agent extracts candidate follow-ups, each with a verbatim quote as evidence
       └─ validateFollowUps → create / needs_owner / review / reject
            └─ findTaskMatches (create + needs_owner only)
                 → update an existing task, create as a sub-task,
                   check a closed twin, or create with links
                      └─ agent writes the tasks and comments on the meeting note
```

Unowned (`needs_owner`) items are created and assigned to Dennis to reassign by hand. The agent's instructions are in [`agent-instructions.md`](agent-instructions.md); the live copy is the agent's [Instructions page](https://app.notion.com/p/3ec91b0711ac80bfb174fec18b08bd6e).

## Tools

### `validateFollowUps`

Checks which proposed follow-ups count as tasks. All candidates go to Jev in one request (about 0.4 s for ten).

**Input:** `meetingTitle`, `workflowersPeople` (internal attendees' names), `externalPeople`, and `candidates[]` of `{ ref, title, owner | null, evidence }`. `evidence` must be quoted verbatim from the summary or transcript, because the checks judge the quote rather than the agent's title.

Each candidate is scored on six checks, each a probability that it passes:

| Check | Passes when |
|---|---|
| `concrete` | it's a specific action or deliverable, not a theme or goal |
| `committed` | someone agreed, was assigned, or it's an instruction-style action item; not "consider / maybe / should" |
| `grounded` | the title doesn't add a commitment, owner or deadline the quote doesn't contain |
| `not_done` | it wasn't already done during the meeting |
| `owner_clear` | one person clearly owns it |
| `owner_internal` | that person is in workFlowers |

**Verdicts**, in order of precedence:

| Verdict | Meaning |
|---|---|
| `reject` | a check clearly fails (≤ 0.3): not a task, or owned outside workFlowers |
| `review` | a check is uncertain (< 0.7) or unanswered: report, don't create |
| `needs_owner` | a valid task with no single owner |
| `create` | file it |

### `findTaskMatches`

Compares validated follow-ups with the [Tasks](https://app.notion.com/p/3cf91b0711ac8068aea7dff188463687) database, open and closed. It loads every task (about 6 s), then makes one Jev request per candidate (about 0.8 s for nine).

**Input:** `meetingNoteId` (optional) and `candidates[]` of `{ ref, title, description, owner, client }`. Fill in `client` (e.g. "MRT"): matching relies on it.

For each candidate it compares every open task, plus the 15 closed tasks whose wording is closest. For each pair Jev decides the relationship (`same`, `existing_contains_candidate`, `candidate_contains_existing`, `related`, `unrelated`), and separately whether the two are for the same client, deal or project. Pairs for different clients are dropped.

| Recommendation | The agent should |
|---|---|
| `update_existing` | update `targetTaskId` and link this meeting; not create |
| `confirm_duplicate` | not create; flag the possible duplicate in its comment |
| `check_already_done` | compare dates with the closed `targetTaskId`; skip it if it's the same occurrence |
| `create_as_subtask` | create with `Parent task` = `targetTaskId` |
| `confirm_subtask` | create, and flag that it may belong under `targetTaskId` |
| `create` | create |

Every result also returns `relatedTaskIds` (for `Related to`), `childTaskIds` (tasks to move under the new one) and the top five `matches` with their probabilities.

Both tools return `success: false` with a message instead of throwing. The agent's instructions tell it to create nothing and post a `Blocked:` comment in that case.

## Layout

```
src/
├── index.ts      # Tool definitions and schemas
├── jev.ts        # TypeSafe API client (direct, retries 429/5xx)
├── validate.ts   # validateFollowUps questions and verdict rules
├── match.ts      # Pool selection, match questions, recommendation rules
└── tasks.ts      # Load and parse Tasks; read the meeting note's relations
```

## Setup and deploy

The worker has one secret, the TypeSafe API key, stored in 1Password (workFlowers account, item `jev-notion-meeting-note-tasks`):

```shell
ntn workers env set "TYPESAFE_API_KEY=$(op read --account work-flowers.1password.com 'op://Private/jev-notion-meeting-note-tasks/credential')"
```

It needs no `NOTION_API_TOKEN`: when the agent calls a tool, Notion provides a token with the agent's own permissions (Tasks: edit, Meeting Notes: comment).

Deploy from the repo root, never with bare `ntn workers deploy`, so the shared package is bundled:

```shell
./scripts/deploy.sh follow-up-tools
```

## Testing

```shell
npm test --workspace=notion-worker-follow-up-tools    # decision rules, no network
npm run check --workspace=notion-worker-follow-up-tools
```

To exercise the deployed validator (`findTaskMatches` needs the agent's Notion token, so test it through the agent):

```shell
ntn workers exec validateFollowUps -d '{"meetingTitle":"Test","workflowersPeople":["Dennis"],"externalPeople":[],"candidates":[{"ref":"1","title":"Send the proposal","owner":"Dennis","evidence":"Dennis to send the proposal by Friday"}]}'
```

For local runs against live data, `.env.tpl` points at the Jev key and the `notion-worker-automations` Notion token.

## Tuning

The thresholds (`PASS`/`FAIL` in `validate.ts`; `SURE`, `MAYBE` and `MIN_SAME_SCOPE` in `match.ts`) were set from a single meeting. Every tool result includes its probabilities, so the agent's run history is the data to tune from. [`CLAUDE.md`](CLAUDE.md) explains why the questions are split the way they are and what the first live run changed.
