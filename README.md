# Political Receipts NG

Politics. Claims. Receipts.

Political Receipts NG is a Nigerian political intelligence and fact-checking desk. It watches political conversation, opens the sentences that can be checked, lays the evidence beside the claim, and prepares posts a human editor can approve.

This version stores the desk in Supabase. An editor can run one bounded X search from Live Intelligence. Gemini, when `GEMINI_API_KEY` is set, extracts claims from those posts and does not post. Evidence for a claim is collected separately, through Brave Search when `BRAVE_SEARCH_API_KEY` is set, or by pasting a URL. Nothing publishes on its own, and nothing polls X.

The account is one person with three interests, tracked over the last 30 live claims: politics about 60 percent, Manchester United about 20 percent, finance about 20 percent. That is a rolling target, not a daily quota. X search groups stay political.

## What this version does

- Briefs the desk: volume, growth, and a queue of open claims.
- Shows a live-intelligence board and a research queue. **Run intelligence scan** prices one recent-search page, then stops. It does not post or leave a watcher running.
- Opens a dossier for every detected claim: the original post placeholder, evidence cards, and a fact-check that is not allowed to sound more certain than the pack.
- Drafts three versions of a researched claim. A is straight. B is conversational. C is a hook that still has to stay inside the evidence.
- Requires a pre-publication checklist before approval is offered.
- **Approve & post to X** shows a final preview and posts only after a second confirmation. A successful send stores the X post id with that approval.
- Shows an empty desk when the database has no rows. Demonstration records appear only after an explicit seed, and they are marked. Analytics does not invent performance numbers.

Classifications used on the desk: Verified, Contradicted, Needs Context, Unverified. Formats: `#CheckAm`, `#ShowYourWorking`, and `#NotTrue`. `#NotTrue` is reserved for claims the evidence clearly contradicts.

No political party is treated as a trusted source.

## Architecture

```
app/                  App Router pages and the X callback
components/           Desk shell and the editorial screens
lib/                  Sample investigations, drafts, archive, source policy
```

The interface is a Next.js App Router application. Pages that can be static are static. Filters and draft edits stay in the browser. X is called from the server for a connection check, a confirmed publish, or one manual search. The sample investigations live in `lib/`.

| Route | Purpose |
| --- | --- |
| `/` | Morning briefing and system status |
| `/intelligence` | Manual scan, research queue, and conversation board |
| `/api/intel/estimate` | Prices the next scan. It does not call X. |
| `/api/intel/scan` | One editor-triggered search, then claim extraction. It does not post. |
| `/api/intel/claim` | Investigate or dismiss a queued claim. |
| `/claims` | Detected claims |
| `/claims/[id]` | Dossier: claim, post, evidence, fact-check |
| `/drafts` | Three versions, checklist, approval gate |
| `/published` | Sample archive of human-approved posts |
| `/sources` | Citation policy and source classes |
| `/analytics` | Rates computed from the sample archive |
| `/settings` | X, Gemini, rules, publishing, account |
| `/api/auth/x/start` | Starts OAuth 2.0 with PKCE. Server-only. |
| `/api/auth/x/callback` | Validates state, exchanges the code, names the account, then discards the tokens. |
| `/api/x/connection` | Editor-only profile check. It does not post. |
| `/api/x/intent` | Seals a one-time publish ticket after the checklist passes. |
| `/api/x/publish` | Sends one confirmed draft. A person has to open it. |

Evidence cards distinguish primary government sources, official statistics, legislation and court records, established news, independent fact-checkers, and other sources. News and prior fact-checks are leads. The underlying document still has to be opened.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run typecheck
npm run build
npm run start
```

`npm run build` is the production build. `npm run start` serves that build, on port 3000 unless `PORT` is set.

The desk still opens with an empty environment. X calls stay closed until the server has credentials. Copy the example file only when you are ready to add them locally:

```bash
cp .env.example .env.local
```

Do not commit `.env.local`. `.env.example` is the only env file that belongs in git, and it contains empty placeholders.

## Environment variables

X, Supabase, and Gemini are read only in server modules. Gemini is used for claim extraction, not for publishing.

| Variable | Where it is used |
| --- | --- |
| `X_CLIENT_ID` | Server-side OAuth 2.0 client id. It appears in the browser only as the public `client_id` on the X authorise redirect. |
| `X_CLIENT_SECRET` | Server-side OAuth 2.0 secret. Used for the code exchange and to seal short-lived cookies. Never sent to the browser. |
| `X_API_KEY` | Server-side OAuth 1.0a consumer key |
| `X_API_SECRET` | Server-side OAuth 1.0a consumer secret |
| `X_ACCESS_TOKEN` | Server-side user token for the desk account |
| `X_ACCESS_TOKEN_SECRET` | Server-side token secret |
| `GEMINI_API_KEY` | Server-side Gemini key for claim extraction. |
| `GEMINI_MODEL` | Optional server override. When unset, the default in `lib/ai/env.ts` is used (currently `gemini-3.8-flash`). |
| `BRAVE_SEARCH_API_KEY` | Server only. Brave Search API token. Research search does not run when it is unset. Never prefix it with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase anon key, safe to expose only because row-level security must restrict it |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never prefix it with `NEXT_PUBLIC_` and never import it into a client component. |
| `TOKEN_ENCRYPTION_KEY` | Server only. 32-byte key, base64. Generate with `openssl rand -base64 32`, then add that value in Vercel. Never commit it. OAuth tokens are not stored without it. |

X and Gemini secrets must stay on the server. The settings screen never accepts a key and never renders a secret. “Configured” means the variable is present. It does not mean the account has been verified.

## Deployment

The app is a standard Next.js project.

1. Push the repository to GitHub.
2. Import it in Vercel, or deploy the connected project. Framework preset: Next.js. Root directory: the repository root.
3. Set the six `X_*` variables in the Vercel project environment. Do not mark them as exposed to the browser.
4. Deploy.

Production addresses for the X developer portal:

- Website URL: `https://political-receipts-ng.vercel.app`
- Callback URL: `https://political-receipts-ng.vercel.app/api/auth/x/callback`

## X integration

Two server-side paths exist. Neither one runs on a timer.

**OAuth 1.0a.** `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, and `X_ACCESS_TOKEN_SECRET` identify the desk account already issued by X. Settings → Test connection calls `GET /2/users/me` once per click, with a short cooldown. It does not post. Publishing uses `POST /2/tweets` only from `/api/x/publish`, and only after the checklist, a one-time ticket, and an explicit confirmation of the exact text.

**OAuth 2.0 with PKCE.** Connect X Account sends the editor to X with `tweet.read`, `tweet.write`, `users.read`, and `offline.access`. The callback checks the state cookie, exchanges the code, reads the account, and writes the access and refresh tokens only as AES-256-GCM ciphertext in `x_connections`. That write needs `TOKEN_ENCRYPTION_KEY`. Without the key, the tokens are dropped and nothing is stored. The anon key cannot read the table.

The publish id and URL stay in the browser session that sent the post. Refreshing clears them. That is intentional until an audit table exists.

Nothing in the app polls X, opens a stream, or replies to a post. Search runs only from **Run intelligence scan**, one request of at most 10 posts, with a daily ceiling. The publish route is unchanged: a person still confirms the exact text.

## Claim extraction

Gemini’s job in this phase is claim extraction, not verdicts and not drafts.

1. Set `GEMINI_API_KEY` on the server. Do not prefix it with `NEXT_PUBLIC_`.
2. A scan sends only posts that already matched a configured political term. Nigeria by itself is not enough.
3. The model must return JSON. The server drops a claim when a number, quotation, or URL is not in the source post.
4. Importance is High, Medium, or Low from reach, account count, and whether a record could check the sentence. It is not a candidate score.
5. `#NotTrue` stays unavailable until collected evidence contradicts the claim at high confidence. Incomplete evidence stays Unverified or Needs Context.
6. Find evidence shows the claim type, the questions, and the source tiers for that pillar, then waits. Begin research calls Brave only after the editor clicks it and only when `BRAVE_SEARCH_API_KEY` is set. A pasted URL is fetched by the server, with private addresses refused. Gemini is not asked to browse, and it is not retried on its own.

Search terms live in `search_groups`. They stay on Nigerian politics. Football and finance have their own source tiers and are not added to the X rotation. Research limits live in `lib/research/limits.ts`. Usage for the Lagos day, including search and document retrieval, is under Settings → Usage.

## Database

Migrations live in `supabase/migrations`. Apply them with the Supabase CLI after `supabase login` and `supabase link --project-ref <project-ref>`. The project ref is the subdomain of `NEXT_PUBLIC_SUPABASE_URL`. Do not paste the service role key into chat.

```bash
npx supabase db push
```

The anon and authenticated roles have no privileges on the editorial tables. The Next.js server uses the service role. Row level security is enabled and forced, with no public policies.

Demonstration claims, sources, and drafts stay in `lib/claims.ts`, `lib/conversations.ts`, and `lib/drafts.ts`. They are not shown until you explicitly seed them:

```bash
SEED_DEMO=1 npm run seed:demo
```

The seed marks every row `origin = demo`, replaces previous demo rows, and does not insert metrics or tokens. The interface badges those rows. An empty database shows an empty desk instead of fake production numbers. Analytics says “No real performance data yet” until `post_metrics` has readings.

Generate the encryption key on your own machine and add it to Vercel as `TOKEN_ENCRYPTION_KEY`:

```bash
openssl rand -base64 32
```

## Sample data

Counts, posts, handles, and evidence cards are demonstration material for the product. They are not a live monitoring feed, and they are not published fact-checks. Where a dossier cites a public figure such as the 2023 INEC register or the 2024 minimum-wage amendment, the surrounding card still belongs to the sample pack. Do not quote this deployment as a newsroom’s finding.
