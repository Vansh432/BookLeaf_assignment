# BookLeaf Author Support & Communication Portal

A support portal for BookLeaf Publishing with two sides:

- **Authors** sign in, see their books with sales and royalties, raise support tickets and follow replies in real time.
- **The BookLeaf team** works a prioritised ticket queue with AI triage and AI-drafted replies grounded in
  BookLeaf's policies and each author's real records, plus an author directory and an AI usage dashboard.

AI never blocks the workflow: tickets are saved first, every AI step has a non-AI fallback, and no reply reaches
an author without an admin sending it. The design and measured results are in **[ai-design.md](ai-design.md)**.

| | |
|---|---|
| **Live demo** | **https://app.vanshdeep.space** (sign in with the [demo accounts](#demo-accounts)) |
| API | https://api.vanshdeep.space/api/v1 ([health check](https://api.vanshdeep.space/api/v1/health)) |
| Repository | https://github.com/Vansh432/BookLeaf_assignment |
| Write-up | [WRITEUP.md](WRITEUP.md): approach, trade-offs and the path to production |
| Manual test script | [manual-testing.md](manual-testing.md) |

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Scripts](#scripts)
- [Architecture](#architecture)
- [AI integration](#ai-integration)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Testing and evaluation](#testing-and-evaluation)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

## Features

**Author portal**
- Email/password sign-in; each author sees only their own data.
- **My Books:** title, ISBN, genre, publication date, status and production progress, MRP, copies sold, royalty earned, paid and pending.
- **Submit a query** about a book or the account, with subject, description and attachments (UI).
- **My Tickets:** status, the original query and the conversation, updated live over WebSockets.

**Admin portal**
- **Ticket queue:** unresolved first, then by priority, then oldest; filters for status, category, priority, author, assignee and date; live updates; "Review" markers on uncertain triage.
- **Ticket page:**
  - AI triage with its source and reasoning, a review flag and "Looks right";
  - category, priority and status overrides (recorded for accuracy tracking);
  - assign to self;
  - internal notes the author never sees;
  - author and book context;
  - **AI-drafted reply** panel: "Use draft", regenerate, policies used, notes to verify, unsupported-figure warnings.
- **Authors:** a searchable directory with books, sales, royalties and tickets per author, and a detail page per author.
- **AI Usage:** spend, budgets, daily calls, failures, latency, triage override rates and draft quality.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router, Tailwind CSS, Axios, Socket.IO client |
| Backend | Node.js 20.12+ (ES modules), Express 5, Mongoose 9, zod, Socket.IO, Helmet, express-rate-limit, Winston |
| Database | MongoDB Atlas (Vector Search for policy retrieval); plain MongoDB works with keyword retrieval |
| Auth | JWT access and refresh tokens in httpOnly cookies, refresh-token rotation with reuse detection, role-based access |
| AI | Google Gemini via `@google/genai`: `gemini-3.5-flash-lite` (triage, summaries, drafts), `gemini-embedding-2` (retrieval) |
| Tests | `node:test` (built into Node; no extra framework) |

## Quick start

**Prerequisites:** Node.js 20.12 or newer, a MongoDB Atlas cluster (or local MongoDB without vector search),
and optionally a Gemini API key.

### 1. Database (MongoDB Atlas)

Atlas is required for Vector Search, which powers policy retrieval for drafted replies. Plain local MongoDB
also runs the app; retrieval then falls back to keyword search.

1. **Create a cluster** at [cloud.mongodb.com](https://cloud.mongodb.com). The free M0 tier supports Vector Search.
2. **Create a database user** (*Security → Database Access*) with read and write access to the `bookleaf` database.
3. **Allow network access** (*Security → Network Access*): your IP for local development; the host's outbound IPs
   in production (`0.0.0.0/0` only if the host has no static IP).
4. **Copy the connection string** (*Connect → Drivers*) into `backend/.env`, adding the database name after the host:

   ```env
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/bookleaf?retryWrites=true&w=majority
   ```

   URL-encode special characters in the password. If your network refuses the DNS lookups `mongodb+srv://`
   needs (`querySrv ECONNREFUSED`), set `DNS_SERVERS=8.8.8.8,1.1.1.1`.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env        # then set MONGODB_URI, the two JWT secrets and (optionally) GEMINI_API_KEY
npm run seed                # sample authors and books + two admin accounts
npm run db:indexes          # regular indexes + the Atlas Vector Search index
npm run kb:ingest           # BookLeaf knowledge base, embedded with Gemini
npm run dev                 # API on http://localhost:5000
```

Generate each JWT secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
With a Gemini key, `AI_PRICING` must list every configured model; `.env.example` has working values.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env        # VITE_API_BASE_URL=http://localhost:5000/api/v1
npm run dev                 # app on http://localhost:5173
```

## Demo accounts

These work on the **[live demo](https://app.vanshdeep.space)** and locally. They are created by `npm run seed` from
the provided sample dataset (10 authors, 18 books); passwords come from `SEED_AUTHOR_PASSWORD` /
`SEED_ADMIN_PASSWORD`, and the defaults are shown.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@bookleaf.com` | `Admin@123` |
| Admin | `support@bookleaf.com` | `Admin@123` |
| Author (overdue royalties) | `rohit.kapoor@email.com` | `Author@123` |
| Author (book in production) | `sneha.kulkarni@email.com` | `Author@123` |
| Author (₹850 pending, below payout threshold) | `kavita.deshmukh@email.com` | `Author@123` |

Every author in the dataset can sign in with the author password. A step-by-step test script (one author and
one admin, with expected results) is in [manual-testing.md](manual-testing.md).

Each account allows one active session: signing in again elsewhere signs the earlier session out.

## Scripts

From `backend/`:

| Command | What it does |
|---|---|
| `npm run dev` / `npm start` | Start the API (dev restarts on file changes) |
| `npm run seed` | Upsert sample authors, books and admins (keeps tickets); `seed:fresh` wipes users, books, tickets and counters first |
| `npm run db:indexes` | Create regular indexes and the Atlas Vector Search index (safe to re-run) |
| `npm run kb:ingest` | Load the knowledge base and embed new or changed chunks (safe to re-run; unchanged chunks cost nothing) |
| `npm test` | 115 unit and integration tests against a local `bookleaf_test` database, with Gemini mocked |
| `npm run eval` | Offline AI evaluation: rules and keyword retrieval on a throwaway local database (free) |
| `npm run eval:live` | Live AI evaluation with Gemini and Atlas (about $0.024); add `-- --only=drafts` (or `triage`, `retrieval`) |

From `frontend/`: `npm run dev`, `npm run build`, `npm run lint`.

## Architecture

```
frontend (React)  ──REST /api/v1 + Socket.IO──►  backend (Express)  ──►  MongoDB Atlas
                                                     │                   (data + vector index)
                                                     └── AI gateway ──►  Gemini API
```

**Backend** (`backend/src/`) is organised by module (route → validation → auth/role middleware → controller →
service → Mongoose model):

| Module | Responsibility |
|---|---|
| `auth` | Login, refresh-token rotation, logout, current user |
| `books` | Author books and royalty figures (pending is derived as earned − paid, never stored) |
| `tickets` | Ticket lifecycle, messages, overrides, assignment, internal notes, live events |
| `users` | Admin author directory and profiles |
| `triage` | AI category and priority: rules, model classifier, background worker |
| `drafts` | AI-drafted replies: facts, prompt, grounding checks, caching |
| `context` | Rolling conversation summaries for prompts |
| `knowledge` | Knowledge-base chunks, ingestion, vector and keyword retrieval |
| `ai` | The AI gateway: budgets, limits, retries, circuit breaker, usage accounting, `/ai/usage` |

**Frontend** (`frontend/src/`) follows the same domain split under `modules/` (`auth`, `books`, `tickets`,
`authors`, `analytics`, `users`), with shared UI, hooks and the API client in `shared/` and routes in `app/router.jsx`.

**Key decisions**
- **Cookies, not local storage, for tokens:** httpOnly cookies keep tokens away from JavaScript; an Origin check
  protects state-changing requests from CSRF.
- **Real time without leaking data:** socket events carry only ids; clients refetch through the REST API,
  which applies role-based views, so internal data never travels over the socket.
- **Concurrency-safe updates:** status changes, triage, summaries, drafts and budgets all use conditional
  atomic updates, so two admins (or two workers) never overwrite each other.
- **No Redis or queue server:** AI jobs are low-volume and made durable through MongoDB state, a lease and a sweep.
  The trade-offs are covered in [ai-design.md](ai-design.md).

## AI integration

Summary; details, prompts and measurements in **[ai-design.md](ai-design.md)**.

| Capability | How it works | Fallback |
|---|---|---|
| **Auto-classification and priority** | Keyword rules decide clear cases for free, using book records for royalty urgency (e.g. "₹5,280 pending, last payout 419 days ago" → Critical). Gemini is asked when the category is unclear, no priority rule matched, or the text looks like prompt injection. Uncertain results are flagged for admin review. | Rules' best guess, flagged for review |
| **AI-drafted replies (RAG)** | Atlas Vector Search over the BookLeaf knowledge base, account facts computed from the database (including the next payout date), the conversation summary and recent messages. Gemini writes the body; code adds the greeting and sign-off. Figures not found in the sources are flagged. | Keyword retrieval; "No matching policy" or "AI unavailable", so the admin writes manually |
| **Cost and reliability** | One gateway for every call: daily and monthly budgets with expiring reservations, a per-ticket cap, a per-minute request limit, timeouts, bounded retries honouring `Retry-After`, a circuit breaker, and per-call usage records. | Refused calls fall back as above |

**Measured** on a labeled set (live, 25 Oct 2026):
- **Triage:** 93% category accuracy (98% allowing a second valid category); 92% exact priority, with no urgent ticket ranked too low.
- **Retrieval:** recall 0.95.
- **Drafts:** 9/9 contained the required facts, with 0% unsupported claims.
- **Cost:** about **$0.0002 per ticket** for triage and **$0.0008 per draft**.

## Environment variables

### Backend (`backend/.env`)

All values are validated at startup (`src/config/env.js`); the server refuses to start with an invalid configuration.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | | `development` | `development`, `production` or `test` |
| `PORT` | | `5000` | API port |
| `MONGODB_URI` | ✅ | | MongoDB connection string (include `/bookleaf`) |
| `DNS_SERVERS` | | | Comma-separated DNS servers for `mongodb+srv://` lookups when the system DNS refuses them |
| `CLIENT_URLS` | ✅ | | Comma-separated frontend origins allowed by CORS, the socket and the Origin check |
| `LOG_LEVEL` | | `info` | `error`, `warn`, `info`, `http` or `debug` |
| `JWT_ACCESS_SECRET` | ✅ | | ≥ 32 characters |
| `JWT_REFRESH_SECRET` | ✅ | | ≥ 32 characters, different from the access secret |
| `JWT_ACCESS_TTL_SECONDS` | | `900` | Access token lifetime |
| `JWT_REFRESH_TTL_SECONDS` | | `604800` | Refresh token lifetime |
| `COOKIE_SAME_SITE` | | `lax` | `none` when frontend and API are on different sites (requires secure cookies) |
| `COOKIE_SECURE` | | production, or when `none` | Secure cookie flag |
| `SEED_AUTHOR_PASSWORD` / `SEED_ADMIN_PASSWORD` | | `Author@123` / `Admin@123` | Demo passwords applied by `npm run seed` |
| `GEMINI_API_KEY` | | | Enables AI. Server-side only. Without it every AI step falls back |
| `GEMINI_GENERATION_MODEL` | | `gemini-3.5-flash-lite` | Triage and summaries (and drafts unless overridden) |
| `GEMINI_DRAFT_MODEL` | | generation model | Optional stronger model for drafted replies |
| `GEMINI_EMBEDDING_MODEL` | | `gemini-embedding-2` | Embeddings for policy retrieval |
| `EMBEDDING_DIMENSIONS` | | | Vector size (768 recommended); the vector index is created only once this is set |
| `AI_PRICING` | with a key | `{}` | JSON, USD per 1M tokens per model, e.g. `{"gemini-3.5-flash-lite":{"input":0.30,"output":2.50,"cachedInput":0.03},"gemini-embedding-2":{"input":0.20}}`; must cover every configured model |
| `AI_DAILY_BUDGET_USD` | | `1` | Hard daily cap on estimated AI spend |
| `AI_MONTHLY_BUDGET_USD` | | `10` | Hard monthly cap |
| `AI_MAX_CALLS_PER_TICKET` | | `20` | AI calls allowed per ticket (query embeddings excluded) |
| `AI_REQUESTS_PER_MINUTE` | | `{}` | JSON per-model request limit, e.g. `{"gemini-3.5-flash-lite":12}` (below the free tier's 15) |
| `AI_REQUEST_TIMEOUT_MS` | | `60000` | Per-attempt timeout, also sent to Gemini as its deadline |
| `AI_MAX_ATTEMPTS` | | `3` | Attempts per AI call; only timeouts, 429 and 5xx are retried |
| `AI_RETRY_BASE_DELAY_MS` | | `500` | Base for exponential backoff |

### Frontend (`frontend/.env`)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | API base URL, e.g. `http://localhost:5000/api/v1`. Public; never put secrets in frontend variables |

## API reference

Base path `/api/v1`. All endpoints except login, refresh, logout and health require the session cookie.

**Responses** share one shape:

```json
{ "status": true, "message": "Tickets fetched successfully", "data": { } }
{ "status": false, "message": "Validation failed", "errors": [{ "location": "body", "field": "subject", "message": "..." }] }
```

Status codes: 400 validation, 401 not signed in, 403 wrong role or origin, 404 not found or not yours,
409 concurrent change, 413 body too large, 429 rate limited.

### Auth

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/login` | Public | `{ email, password }`; sets cookies; 10 failed attempts per 15 min |
| POST | `/auth/refresh` | Refresh cookie | Rotates tokens; reuse of an old refresh token revokes the session |
| POST | `/auth/logout` | Any | Clears the session |
| GET | `/auth/me` | Signed in | Current user |

### Books

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/books` | Author, admin | `page`, `limit`, `status`; admins may filter by `authorId`. Returns books and royalty totals |
| GET | `/books/:id` | Author (own), admin | One book with derived `royaltyPending` |

### Tickets

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/tickets` | Author | `{ bookId (own book or null), subject, description }`; 20 per hour. Triage runs in the background |
| GET | `/tickets` | Author (own), admin | `page`, `limit`, `status`, `category`, `from`, `to`; admins also `priority`, `assigned` (`me`/`unassigned`), `authorId`. Includes status counts |
| GET | `/tickets/:id` | Author (own), admin | Authors get an author view (no priority, triage, notes or drafts) |
| POST | `/tickets/:id/messages` | Author (own), admin | `{ body }`; admins may add `status` and `draftId` (records whether the AI draft was edited) |
| PATCH | `/tickets/:id` | Admin | Any of `{ status, category, priority, reviewed: true }`; overrides are recorded |
| POST | `/tickets/:id/assign` | Admin | Assign to yourself |
| POST | `/tickets/:id/notes` | Admin | Internal note (never shown to the author) |
| GET | `/tickets/:id/draft` | Admin | Current AI draft with staleness reasons, or `null` |
| POST | `/tickets/:id/draft` | Admin | `{ regenerate?: boolean }`; returns the current draft or generates one. Always 200: `status` is `ready`, `no_policy` or `unavailable` |

### Authors and AI usage

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/users/authors` | Admin | `page`, `limit`, `search` (name, email, code), `withStats=true` (books, sales, royalties, tickets) |
| GET | `/users/authors/:id` | Admin | Author profile with book and ticket totals |
| GET | `/ai/usage` | Admin | `from`, `to` (YYYY-MM-DD), `includeEvaluation`. Spend, budgets, daily calls, per-operation stats, failure reasons, triage and draft quality, AI configuration |
| GET | `/health` | Public | Uptime and database status |

### Real-time events

Socket.IO on the API origin, authenticated with the same session cookie. Authors join their own room; admins
join the admin room. Event `ticket:changed` carries `{ ticketId, ticketNumber, action, actorId, actorRole }`
(actions: `created`, `message`, `updated`, `assigned`, `note`, `classified`); clients refetch over REST.

## Testing and evaluation

- **`npm test`** (backend): 115 unit and integration tests for the AI features and the services they touch:
  - the AI gateway: budgets under concurrency, expiring reservations, retries and `Retry-After`, the circuit
    breaker, the request limiter, structured-output validation;
  - triage: rules, decisions, injection handling, the background job, overrides;
  - conversation summaries;
  - drafts: grounding checks, prompt fencing, staleness, send tracking, authors blocked from drafts;
  - the author directory and usage metrics.

  They run against a local `bookleaf_test` database (refusing any other), with Gemini mocked. The pre-existing
  auth, books and ticket endpoints have no automated tests.
- **`npm run lint` / `npm run build`** (frontend).
- **`npm run eval` / `npm run eval:live`** (backend): the labeled AI evaluation described in
  [ai-design.md](ai-design.md#8-evaluation-results). Reports go to `backend/src/tests/eval/reports/` (git-ignored).
- **Manual:** [manual-testing.md](manual-testing.md).

## Deployment

The live demo runs as:

| Part | Host | Address |
|---|---|---|
| Frontend | Vercel | `https://app.vanshdeep.space` |
| API + Socket.IO | Render | `https://api.vanshdeep.space` |
| Database | MongoDB Atlas | `bookleaf` database with the vector index |

**Serve the frontend and API from the same site.** Here they are two subdomains of one domain. Sessions use
httpOnly cookies, and browsers that block third-party cookies (Chrome with that setting, and Safari always)
reject cookies from an API on a different site, such as `*.onrender.com` behind a `*.vercel.app` frontend.
Sign-in then fails, and so do real-time updates. Subdomains of one domain are the same site, so the cookies are
first-party and `SameSite=Lax` works. Verified on the live demo with third-party cookies blocked.

1. **Database:** an Atlas cluster with network access for the API host. From a machine with the production
   `.env`, run once: `npm run seed`, `npm run db:indexes`, `npm run kb:ingest`.
2. **Backend** (Render web service, root `backend/`): build `npm install`, start `npm start`. Add the custom domain
   (`api.` subdomain, CNAME to the service). Environment:
   - `NODE_ENV=production`, `MONGODB_URI`, both JWT secrets;
   - `CLIENT_URLS=https://app.<your-domain>` (exact origin, no trailing slash);
   - `COOKIE_SAME_SITE=lax`, `COOKIE_SECURE=true`;
   - the AI variables.

   The app trusts one proxy hop (Render's) for client IPs in rate limiting.
3. **Frontend** (Vercel project, root `frontend/`): build `npm run build`, output `dist/`. Add the custom domain
   (`app.` subdomain, CNAME to Vercel) and set `VITE_API_BASE_URL=https://api.<your-domain>/api/v1`, then redeploy,
   since Vite reads it at build time. `frontend/vercel.json` serves `index.html` for client-side routes.
4. **AI in production:**
   - Use a **paid Gemini key**: the free tier allows 15 requests per minute and lets Google use prompts, which contain author data.
   - Raise `AI_REQUESTS_PER_MINUTE` to match your quota.
   - Review `AI_PRICING` whenever Google changes its prices.
   - Run **one API instance**, or divide the per-minute limit between instances (see limitations).

## Known limitations

- **Single-instance AI coordination:** the circuit breaker, request limiter and triage queue are per process.
  Budgets, per-ticket caps and job leases are shared through MongoDB and remain correct with more instances.
- **Evaluation:** small (59 tickets) and used for tuning, so accuracy figures are optimistic until measured on real
  tickets; the admin override rates on the AI Usage page are the real-world check.
- **Costs are estimates** from `AI_PRICING`, not invoices.
- **Payout dates assume calendar quarters**; the policy does not specify.
- **Attachments are UI only** (as the assignment allows); files are not uploaded.
- **Metrics:** the AI Usage page groups by UTC day and refreshes on demand; draft quality counts each ticket's
  latest draft.
- **Test coverage gaps:** the frontend has no test framework (UI flows were verified manually and with a
  headless browser), and the auth, books and core ticket endpoints predate the test suite and have no automated tests.
- More AI-specific limitations are listed in [ai-design.md](ai-design.md#10-known-limitations).
