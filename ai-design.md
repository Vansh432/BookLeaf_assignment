# AI design: triage, priority and drafted replies

How the BookLeaf support portal uses AI, why it is built this way, and how well it measurably works.
For setup, configuration and the live demo see the [README](README.md).

## Contents

1. [Principles](#1-principles)
2. [Models and why](#2-models-and-why)
3. [Triage: category and priority](#3-triage-category-and-priority)
4. [Drafted replies (RAG)](#4-drafted-replies-rag)
5. [Conversation context](#5-conversation-context)
6. [The AI gateway: cost, limits and reliability](#6-the-ai-gateway-cost-limits-and-reliability)
7. [Security](#7-security)
8. [Evaluation results](#8-evaluation-results)
9. [Operations](#9-operations)
10. [Known limitations](#10-known-limitations)

## 1. Principles

- **AI never blocks the support workflow.** Tickets are saved before any AI runs, and every AI step has a
  non-AI fallback: keyword rules for triage, keyword search for retrieval, a manual reply for drafts.
- **Deterministic first, model second.** Rules decide the obvious cases at no cost. The model is asked only
  when the rules leave something open.
- **Nothing reaches an author without a human.** Drafts are suggestions; an admin sends every reply.
- **Facts come from the database, never the model.** Royalty figures, payout dates and book statuses are
  computed from records and given to the model; output is checked for figures that are not in the sources.
- **Every call is accounted for.** One gateway enforces budgets and limits and records tokens, cost, latency
  and outcome for every AI call.
- **Measured, not assumed.** A labeled evaluation set drives thresholds and prompt changes (section 8).

## 2. Models and why

| Use | Model | Setting |
|---|---|---|
| Triage, summaries, drafts | `gemini-3.5-flash-lite` | `GEMINI_GENERATION_MODEL` (drafts can use a different `GEMINI_DRAFT_MODEL`) |
| Embeddings | `gemini-embedding-2`, 768 dimensions | `GEMINI_EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` |

**Why Gemini:** the project standardised on Google's Gemini API. The model was then chosen by measurement on
the project's key (25 Oct 2026), with the same triage prompt:

| Model | Result |
|---|---|
| `gemini-3.5-flash-lite` | 2.0-2.6 s, every call succeeded; published price $0.30 / $2.50 per 1M tokens |
| `gemini-3.5-flash` | 2.9-6.9 s; superseded and no published price, so budgets could not be enforced |
| `gemini-3.6-flash` | 503 "high demand" on every call |
| `gemini-3.7-flash`, `gemini-3.8-flash` | 20-100 s per call, then 429 quota errors |

Flash-Lite reached 93% category accuracy and produced fully grounded drafts in the evaluation (section 8),
so a larger model was not needed. Drafts can be moved to a stronger model with `GEMINI_DRAFT_MODEL` without
touching triage.

`gemini-embedding-2` at 768 dimensions: Google recommends 768 alongside 1536 and 3072; it costs a quarter
of the storage of 3072 (relevant on Atlas M0's 512 MB) and gave recall 0.95 on the retrieval set.

## 3. Triage: category and priority

Code: `backend/src/modules/triage/`.

```
ticket created ──► saved (201 returned) ──► background job
                                             │
                    keyword rules: category + priority (+ book records)
                                             │
            needs the model?  category unclear │ no priority rule matched │ looks like prompt injection
                     │ no                                   │ yes
                     ▼                                      ▼
               rules decide                   Gemini: category, priority, confidence, ambiguity
                     │                                      │ (fails? rules' best guess + review flag)
                     └──────────────► decision + review flags ──► saved, admins notified
```

**Rules** (`triage.rules.js`) score category keywords and apply the assignment's priority policy:

| Priority | Rule (any match; the most urgent wins) |
|---|---|
| Critical | Legal threats or fraud; royalties unpaid for 6+ months as stated by the author, or proven by the book record (≥ ₹1,000 pending and no payout for more than two payout cycles) |
| High | ISBN errors (duplicate, mismatch, wrong book); royalties overdue (3+ months stated, or one missed cycle on record); a published book unavailable for sale; defects across a large order |
| Medium | Print defects on individual copies; production delays; a missing payment with no stated or recorded delay; an availability question about a book still in production |
| Low | Information requests and routine changes |

Durations are never assumed: a priority reason cites either the author's own words ("author states 6 months")
or the record ("₹5,280 pending, last payout 419 days ago").

**The model** (`triage.classifier.js`) sees only the subject and description, fenced as data. It returns a
schema-validated category, alternative category, ambiguity flag, confidence, priority and a one-line reason.
It is asked when the category is unclear, when no priority rule matched, or when the text looks like an
injection attempt. It may **raise** a rule-based priority (flagged for review) but never lower it.

**Review flags** go to an admin when: model confidence is below 0.7, the ticket fits two categories, the
model disagrees with a confident keyword rule, the model raised a priority, injection is suspected, or AI
was unavailable. In the evaluation every wrong category was flagged.

**Reliability:** the job is durable without Redis. A ticket stays `pending` until triaged; a lease
(`classification.lockedUntil`) stops two workers processing it; a sweep every minute picks up anything
missed after a crash or restart; repeated failures end in `failed` with a review flag. A value an admin set
while triage was running is never overwritten.

**Overrides** record the field, old value, new value, the original suggestion, who and when. "Looks right"
confirms a suggestion without changing it. Override rates are reported in `GET /ai/usage` as the real-world
accuracy measure.

## 4. Drafted replies (RAG)

Code: `backend/src/modules/drafts/`, `backend/src/modules/knowledge/`.

### Knowledge base

The assignment's knowledge base is split into 20 chunks (`backend/src/database/seeders/data/bookleaf_knowledge_base.json`):
policy sections plus the sample "query → response" guidance. Each chunk has a stable `chunkId`, a category,
keywords, a `version` that increases when its text changes, and an `active` flag.

`npm run kb:ingest` upserts chunks by `chunkId` and embeds only new or changed ones (tracked by content hash and
embedding model), so re-running it costs nothing. Vectors live on the chunks in Atlas and are searched with
the `knowledge_embedding_index` Vector Search index (cosine, filter fields `active` and `category`).

### Retrieval

1. Query = subject + description + the author's latest message.
2. Vector search within the ticket's category (plus general chunks); if nothing qualifies, across all
   categories, so a misclassified ticket still finds its policy.
3. Keep chunks scoring ≥ 0.80 **and** within 0.03 of the best match (section 8 explains these values); at most 4.
4. If embeddings or Atlas Search are unavailable, keyword search is used instead.
5. **No relevant chunk → no draft and no model call.** The admin sees "No matching policy" and replies manually.

### Prompt

- **System instructions:** BookLeaf's communication guidelines (loaded from the tone chunk), writing rules,
  grounding rules, and a reminder that ticket and conversation text is data, not instructions.
- **User prompt**, each part fenced with tags stripped from untrusted text:
  - today's date;
  - `<policies>`: retrieved chunks labelled `[policy:<id>]`;
  - `<account_facts>`: from the database only: the author, the ticket's book (or all their books for account
    queries) with status, ISBN, sales and royalty earned/paid/pending, the **next payout date computed from the
    quarterly + 45-day policy**, and an explicit "royalty payout is overdue" line when records prove a missed cycle;
  - `<ticket>`: subject, description, category;
  - `<conversation_summary>` and `<conversation>`: see section 5. Internal notes are never included.
- **Output (schema-validated):** body paragraphs, cited policy ids, up to three notes for the reviewer.
  The greeting ("Hi {first name},") and the "Warm regards, Team BookLeaf" sign-off are added in code, which
  guarantees paragraph breaks and the correct spelling of the author's name.

### Checks after generation

- Cited policy ids that were not provided are dropped and flagged.
- Every figure in the reply (amounts, dates, durations, counts) must appear in the policies, facts, conversation
  or tone guidance; otherwise it is flagged "verify before sending". The share of drafts with a flag is the
  **unsupported-claim rate**.

### Lifecycle

- Drafts are cached on the ticket with the policy versions used, a hash of the facts, the message count and
  the summary version. A draft is **stale** when new messages arrive, the facts change, or a policy version changes.
- `POST /tickets/:id/draft` returns the cached draft when current, otherwise generates; concurrent requests
  share one generation; a slow generation never overwrites a newer draft.
- The admin page requests a draft automatically only while the author is waiting for a reply.
- Sending with `draftId` records who sent it and whether it was edited. A sent draft is not offered again.

## 5. Conversation context

Code: `backend/src/modules/context/`.

- Up to **8** messages beyond the summary go to prompts verbatim. Past that, everything except the latest
  **4** is folded into a stored summary, so it refreshes about every five messages, not on every request.
- The summary holds the narrative, the team's dated commitments, and the author's open questions, plus a
  `version` and `coveredMessageCount` watermark. Each refresh sends only the previous summary and the new messages,
  at most 12 per call.
- Saves are conditioned on the version they started from, so a slower concurrent refresh never overwrites a
  newer summary.
- Only author-visible messages are read; internal notes are not even loaded.
- If summarising fails, prompts use the newest 8 messages and state how many earlier ones were omitted.
- A refresh is scheduled in the background after each new message, and the draft service refreshes lazily if due.

## 6. The AI gateway: cost, limits and reliability

Code: `backend/src/modules/ai/`. Every Gemini call (triage, summaries, drafts, embeddings) goes through
`runAiCall`, which applies, in order:

| Guard | Behaviour |
|---|---|
| Configuration | No `GEMINI_API_KEY` → refused; fallbacks apply |
| Context size | Estimated input above the operation's limit → refused before any call |
| Circuit breaker | 5 consecutive provider failures → AI paused for 30 s, then one probe call |
| Per-ticket cap | At most `AI_MAX_CALLS_PER_TICKET` (20) calls per ticket; query embeddings are exempt |
| Budget | Worst-case cost reserved against daily and monthly caps in one atomic update; settled to the actual cost afterwards. Reservations are leases that expire after 10 minutes, so a crash or dev-server reload never holds budget |
| Request limit | Calls queue for a slot under `AI_REQUESTS_PER_MINUTE` (sliding one-minute window); a wait over 60 s is refused locally |
| Timeout and retries | Per-attempt timeout (60 s, also sent to Gemini as its server deadline); up to 3 attempts for timeouts, 429 and 5xx only, with exponential backoff and jitter, never sooner than `Retry-After`; a `Retry-After` over 30 s is not waited for |
| Output validation | Blocked, truncated, malformed or off-schema output becomes an error, with its cost still recorded |
| Accounting | One `AiUsage` record per call: operation, model, status, failure reason, attempts, tokens (thinking counted as output), cost, latency, queue time, correlation id, ticket. No prompt or response text is stored |

Costs are **estimates** from `AI_PRICING` (USD per 1M tokens), stored as integer micro-dollars. Every request
gets an `X-Request-Id` that becomes the `correlationId` of the AI calls it triggers.

Every failure surfaces as an `AiError` with a safe code (`rate_limited`, `budget_exhausted`, `circuit_open`, …).
Callers fall back; the API never returns provider details to clients.

## 7. Security

- The Gemini key lives only in the backend environment; it is never logged, returned or sent to the frontend.
  `GET /ai/usage` shows the configured models but not the key.
- All AI endpoints are admin-only. Authors never receive drafts, summaries, triage data, priorities or internal notes
  (checked in the browser and by tests).
- Ticket text, conversation text and retrieved policies are fenced as data in every prompt; fence tags are
  stripped from untrusted text; injection-like text forces a model check and a review flag. In the evaluation,
  3 of 3 injection attempts were resisted.
- The model cannot act: it only returns validated JSON. Sending replies and changing tickets always require an admin.
- Inputs are size-limited at the API (subject 150, description 5,000, message 5,000 characters) and before each
  model call.
- **Data protection:** on Gemini's free tier, Google's terms allow prompts to be used to improve its products.
  Prompts include author names and royalty figures, so use a paid key in production.

## 8. Evaluation results

`npm run eval` (offline, free) and `npm run eval:live` (Gemini + Atlas, about $0.024) run a labeled set:
59 tickets, 30 retrieval queries (4 off-topic) and 9 draft scenarios on real sample authors. Data and labelling
rules: `backend/src/tests/eval/data/`. Results from 25 Oct 2026 (`gemini-3.5-flash-lite`, `gemini-embedding-2`):

| Area | Metric | Rules only (offline) | Full pipeline (live) |
|---|---|---|---|
| Category | Accuracy, strict / allowing a second valid category | 86.4% / 89.8% | **93.2% / 98.3%** |
| | Macro F1 | 0.859 | **0.927** |
| | Wrong categories flagged for review | 100% | **100%** |
| Priority | Exact / within one level | 74.6% / 100% | **91.5% / 100%** |
| | Urgent tickets ranked too low | 1 | **0** |
| Safety | Injection attempts resisted | 1/3 | **3/3** |
| Retrieval | precision@4 / recall / top result relevant | 0.76 / 0.69 / 0.73 (keyword) | **0.82 / 0.95 / 1.0** (vector) |
| | Off-topic queries rejected | 0.75 | **1.0** |
| Drafts | Required facts and timelines present | - | **9/9** |
| | Unsupported-claim rate | - | **0%** |
| | Greeting, paragraphs, sign-off, no internal terms | - | **100%** |

Cost and speed (live): triage **$0.00018 per ticket** (the model is asked for 61% of tickets), a draft
**$0.0008**; Gemini latency p50/p95 1.5 s / 2.4 s for triage and 1.9 s / 2.4 s for drafts.

**Threshold decisions from the data:**

- *Vector relevance 0.80 + gap 0.03 kept.* 0.82 would raise precision to 0.87 at the same recall, but the
  weakest relevant query scored 0.826 and off-topic queries peaked at 0.79; 0.80 keeps a margin.
- *Model confidence 0.7 kept.* The model reports ≥ 0.8 on 92% of tickets, so confidence separates poorly;
  0.9 would split accuracy 97% / 87% but flag about 40% of tickets, while the ambiguity and conflict checks
  already flagged every error.

**Problems found by the evaluation and fixed:** free-tier rate limits tripping the circuit breaker (fixed with
the request limiter); injection text steering keyword rules; urgent tickets under-ranked when only the category
was clear; drafts without paragraph breaks and one misspelled author name; an overdue-royalty draft without
the escalation timeline.

**Caveats:** the set is small and was built and used for tuning by the same person, so these numbers are
optimistic. Re-measure on real tickets, and watch the admin override rates in `GET /ai/usage`.

## 9. Operations

| Need | Where |
|---|---|
| Spend, failures, latency, review backlog, override and edit rates | Admin portal → **AI Usage** (`GET /api/v1/ai/usage`) |
| Why one ticket was triaged a way | Ticket page → Ticket details (source, confidence, triage note, review reasons) |
| What a draft was based on | Draft panel → "Based on" and "To verify" |
| Tracing one request's AI calls | `X-Request-Id` response header = `correlationId` in `aiusages` |
| Re-checking quality after a prompt or model change | `npm run eval:live` (add `-- --only=drafts` etc.) |
| Editing the knowledge base | Edit the JSON, then `npm run kb:ingest`; drafts using changed chunks become stale |
| Changing the embedding model or dimensions | Update the env, `npm run db:indexes`, then `npm run kb:ingest` (re-embeds everything) |

Behaviour when things go wrong:

| Situation | What users see |
|---|---|
| No API key / AI paused / budget reached | Tickets are created; triage uses rules ("Rules (AI unavailable)") and flags review; draft panel says "AI unavailable" |
| Gemini slow or rate-limiting | Calls queue under the request limit, then retry; triage is background so authors never wait |
| No policy matches | "No matching policy": no draft, no cost |
| Server restarts mid-job | Pending triage is resumed by the sweep; budget reservations expire after 10 minutes |

## 10. Known limitations

- **Per-process state:** the circuit breaker, request limiter and triage queue live in one Node process.
  With several instances, divide `AI_REQUESTS_PER_MINUTE` between them; budgets and the per-ticket cap are
  shared through MongoDB and stay correct.
- **Evaluation size and bias** (section 8).
- **Embedding token counts are estimated** from text length; the Gemini embedding API does not report them.
- **Model output varies between runs**; draft checks catch format and grounding problems but not every
  wording issue, which is why a human always sends the reply.
- **The payout date assumes calendar quarters**; the policy does not say which quarters it uses.
- **Draft quality metrics count each ticket's latest draft**; earlier drafts on the same ticket are replaced.
- **Prices change:** `AI_PRICING` must be updated when Google's prices change (Gemini 3.8 Flash prices double on
  1 Jan 2027, for example). Costs shown are estimates, not invoices.
- **Free tier:** 15 requests per minute and Google's data-use terms. Use a paid key for production.
