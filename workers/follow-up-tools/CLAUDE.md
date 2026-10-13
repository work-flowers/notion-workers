# follow-up-tools

Two tools for the **Meeting Follow-up Tasks** Custom Agent
(`agent://9607e18f-5d82-4842-8b96-ca0d32e66011/3ec91b07-11ac-802c-a2e6-00920e6e3bcf`).
The agent still reads the meeting and extracts candidate follow-ups; these tools take
the two judgements it used to make by eye and give them to Jev (TypeSafe), with the
rules that combine Jev's answers kept here in code.

| Tool | Jev requests | What it decides |
|---|---|---|
| `validateFollowUps` | 1 for the whole batch | Does each candidate count as a task? `create` / `needs_owner` / `review` / `reject` |
| `findTaskMatches` | 1 per candidate (4 concurrent) | Update an existing task, create as a sub-task, check a closed twin, or create with links |

No syncs, no databases, no writes: the agent still creates and updates the pages.

## Jev, called directly

Unlike `meeting-note-db-updates` (which relays through Zapier's Jev connection), this
worker calls `https://api.typesafe.ai/v1/systemone` with its own key:

```shell
ntn workers env set TYPESAFE_API_KEY "$(op read --account work-flowers.1password.com 'op://Private/jev-notion-meeting-note-tasks/credential')"
```

Model is `jev-latest`; every tool result reports the answering version (`model`), so a
behaviour change after a TypeSafe release can be traced. 429/5xx/529 retry with backoff.

`NOTION_API_TOKEN` is **not** set on the worker: when a Custom Agent calls a tool, the
platform supplies one scoped to the agent's own permissions (Tasks: edit, Meeting Notes:
comment). Locally, use the `notion-worker-automations` token — see `.env.tpl`.

## validateFollowUps

One Noul per criterion per candidate, all in one request (11 candidates = 66 questions,
~0.4 s). The criteria come from the agent's instructions page:

| Check | Asked as | Fails when |
|---|---|---|
| `concrete` | is it a specific, checkable action? | theme, habit, goal |
| `committed` | did someone commit or get assigned? | consider / maybe / should… |
| `grounded` | does the **title** add anything the evidence doesn't say? *(inverted)* | title hardens a suggestion, adds an owner or deadline |
| `not_done` | was it already done in the meeting? *(inverted)* | done during the call |
| `owner_clear` | is there one clear owner? | nobody, "we", two people → `needs_owner` (the agent assigns these to Dennis to reassign by hand) |
| `owner_internal` | is the owner in `workflowersPeople`? | client/partner owns it → `reject` |

Verdict precedence: **reject** (any hard check ≤ `FAIL` 0.3) > **review** (any < `PASS`
0.7, or no answer) > **needs_owner** > **create**. `owner_internal` is ignored when
`owner_clear` fails, since "is the owner internal?" has no answer without an owner.

**Evidence must be a verbatim quote.** The questions are about the quote, not the
agent's title, so a paraphrase can't launder a suggestion into a commitment.

Lessons from the first live run (MRT meeting, 2026-10-13):

- `grounded` asked positively ("does the evidence support the title?") marked down
  titles that merely *omitted* detail ("…once more information is gathered", p=0.42).
  Asked as "does the title add…?" and inverted, those pass at ~0.87.
- `committed` rejected unowned imperative action items ("Prepare questions for the
  follow-up call") as suggestions. The criteria now say an instruction-style action item
  counts, so they reach `needs_owner` instead.

## findTaskMatches

1. Loads **all** tasks, open and closed (~900, nine pages, ~6 s — the slowest step).
   Closed tasks matter: "already done" and "follow-on of finished work" are both answers.
2. Pool per candidate: every open task (cap 80) + the 15 closed tasks with the most
   IDF-weighted word overlap, boosted for tasks from the same meeting or sharing a
   Companies/Deals/Project relation with it (`rankTasks`). The meeting lookup is
   best-effort; if the page can't be read, ranking just ignores it.
3. Per pooled task, two questions: a **Choice** of relationship (`same`,
   `existing_contains_candidate`, `candidate_contains_existing`, `related`, `unrelated`)
   and a **Noul** "same client, deal or project?". Each question carries its own
   `existing_task` in structured instructions; the state is only the candidate.
4. Code drops pairs with scope < `MIN_SAME_SCOPE` (0.7) or best relationship < 0.35,
   then picks: open `same` ≥ 0.6 → `update_existing`; 0.35–0.6 → `confirm_duplicate`;
   closed `same` ≥ 0.6 → `check_already_done`; open parent ≥ 0.6 → `create_as_subtask`
   (0.35–0.6 → `confirm_subtask`); else `create`. Related/child links need ≥ 0.6.

**Why the scope question is separate.** With "same client" written into the
relationship options, Jev related tasks by theme: an MRT demo was filed under a
Carousell workshop at p=0.97, and an NUS training session came back related to an MRT
proposal. Asked on its own, true pairs scored 0.77–0.98 and wrong-client pairs
0.55–0.69 — hence the 0.7 gate, which applies to `same` too (an MRT proposal otherwise
matched an old proposal for a different Australian client). The candidate's `client`
input matters for the same reason; without it, "the follow-up client call" names no one.

**No meeting-level flags in the Jev prompt.** "Same client as the meeting" is true of
every task from a two-client meeting and misled Jev; it only steers the closed-task
shortlist.

**Dates stay with the agent.** Jev is weak at date comparison, so a closed `same` match
is `check_already_done` with `lastEdited`/`due` attached; the agent decides whether it's
the same occurrence (this month's payroll vs last month's).

## Thresholds are starting values

`PASS`/`FAIL` (validate.ts) and `SURE`/`MAYBE`/`MIN_SAME_SCOPE` (match.ts) were set from
one meeting, not fitted. Tune them from real runs: the per-check probabilities and
`sameScope` are in every tool result, so the agent's session transcripts are the data.

## Testing

```shell
npm test --workspace=notion-worker-follow-up-tools     # pure decision logic, no network
ntn workers exec validateFollowUps -d '{…}'            # deployed; spell out nullable fields as null
```
