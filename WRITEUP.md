# Write-up: BookLeaf Author Support Portal

**Live demo:** https://app.vanshdeep.space · [README](README.md) · AI design and measurements: [ai-design.md](ai-design.md)

## Approach

I treated the AI as an assistant to the support team, not a replacement. Three rules shaped the design:

1. **AI never blocks the workflow.** Tickets are saved before any AI runs; triage is a background job. Every AI step
   has a fallback (keyword rules, keyword search, a manual reply), so the portal works even with Gemini down or
   the budget exhausted.
2. **Facts come from the database, not the model.** Royalties, payout dates and book status are computed from
   records. A ticket is Critical because the record shows "₹5,280 pending, last payout 419 days ago", not because the
   model guessed. Figures in a draft that are missing from the sources are flagged for the reviewer.
3. **A human sends every reply.** Drafts appear in the admin's editor; edits, overrides and confirmations are
   recorded, so real-world accuracy is measurable.

## What I prioritised

- **The core loop:** role-based auth, books with derived royalties, real-time tickets, and a queue that surfaces
  unresolved, urgent and old tickets first.
- **Cheap, explainable triage:** rules decide clear cases for free; the model is asked only when the category is
  unclear, no priority rule fits, or the text looks like prompt injection. Uncertain results are flagged for review.
- **Grounded drafts:** vector search over the knowledge base, the author's records, and a compact conversation
  summary instead of the full history. No matching policy means no draft.
- **One AI gateway:** budgets, a per-ticket cap, throttling, bounded retries, a circuit breaker, and a usage record
  for every call (the AI Usage page).
- **Measurement:** on 59 labeled tickets, 30 queries and 9 draft scenarios, the pipeline reached 93% category
  accuracy, 92% exact priority with no urgent ticket under-ranked, retrieval recall 0.95 and zero unsupported
  figures in drafts, at about $0.0002 per ticket and $0.0008 per draft. The evaluation also exposed problems I
  fixed: rate limits, injection steering the rules, and drafts missing an escalation timeline.

## Trade-offs

- **Gemini Flash-Lite:** the fastest, most reliable model measured on my key (2–3 s), with a published price for
  budget enforcement. Drafts can switch to a stronger model with one setting.
- **No Redis:** jobs are durable through MongoDB state, a lease and a sweep. Simpler to run, but the circuit
  breaker and throttle are per process, which suits one instance.
- **Rules plus model:** more code, but free and predictable for common cases; the model can only raise a
  rule-based priority, never lower it.
- **httpOnly cookies:** safer than tokens in JavaScript, but the frontend and API must share a site, hence the
  `app.` and `api.` subdomains.
- **Evaluation:** small and used for tuning, so the numbers are optimistic; admin override rates are the real check.

## Towards production

1. **Learn from real outcomes:** grow the labeled set from overrides and edited drafts; re-run the evaluation before
   every prompt or model change; alert when override rates rise.
2. **Scale out:** BullMQ and Redis for jobs, shared rate limits and circuit state across instances.
3. **Paid AI tier and data minimisation:** higher quotas, no training on prompts, and only the author data each
   prompt needs.
4. **Richer grounding:** connect the royalty ledger, bank-detail status, shipping and listing data, so drafts leave
   less to verify.
5. **Operations:** real file uploads, email notifications, SLA tracking, end-to-end tests, and alerts on budget,
   errors and latency.
