# Political Receipts NG

Politics. Claims. Receipts.

Political Receipts NG is a Nigerian political intelligence and fact-checking desk. It watches political conversation, opens the sentences that can be checked, lays the evidence beside the claim, and prepares posts a human editor can approve.

This version is a working editorial product on demonstration data. Gemini and Supabase are still unused. X is called only when an editor tests the connection or confirms a finished draft. Nothing publishes on its own.

## What this version does

- Briefs the desk: volume, growth, and a queue of open claims.
- Shows a live-intelligence board for Nigerian political topics, with a detail pane for each conversation.
- Opens a dossier for every detected claim: the original post placeholder, evidence cards, and a fact-check that is not allowed to sound more certain than the pack.
- Drafts three versions of a researched claim. A is straight. B is conversational. C is a hook that still has to stay inside the evidence.
- Requires a pre-publication checklist before approval is offered.
- **Approve & post to X** shows a final preview and posts only after a second confirmation. The returned post id stays in that browser session until a database exists.
- Keeps a sample archive, a source library, analytics computed from that archive, and settings for the X connection.

Classifications used on the desk: Verified, Contradicted, Needs Context, Unverified. Formats: `#CheckAm`, `#ShowYourWorking`, and `#NotTrue`. `#NotTrue` is reserved for claims the evidence clearly contradicts.

No political party is treated as a trusted source.

## Architecture

```
app/                  App Router pages and the X callback
components/           Desk shell and the editorial screens
lib/                  Sample investigations, drafts, archive, source policy
```

The interface is a Next.js App Router application. Pages that can be static are static. Filters and draft edits stay in the browser. The only calls to X are an explicit connection check and a confirmed publish, both from server routes. The sample investigations live in `lib/`.

| Route | Purpose |
| --- | --- |
| `/` | Morning briefing and system status |
| `/intelligence` | Conversation board and detail |
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

Gemini and Supabase are still unused. The X variables are read only in server modules.

| Variable | Where it is used |
| --- | --- |
| `X_CLIENT_ID` | Server-side OAuth 2.0 client id. It appears in the browser only as the public `client_id` on the X authorise redirect. |
| `X_CLIENT_SECRET` | Server-side OAuth 2.0 secret. Used for the code exchange and to seal short-lived cookies. Never sent to the browser. |
| `X_API_KEY` | Server-side OAuth 1.0a consumer key |
| `X_API_SECRET` | Server-side OAuth 1.0a consumer secret |
| `X_ACCESS_TOKEN` | Server-side user token for the desk account |
| `X_ACCESS_TOKEN_SECRET` | Server-side token secret |
| `GEMINI_API_KEY` | Server-side Gemini key for draft preparation |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase anon key, safe to expose only because row-level security must restrict it |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never prefix it with `NEXT_PUBLIC_` and never import it into a client component. |

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

**OAuth 2.0 with PKCE.** Connect X Account sends the editor to X with `tweet.read`, `tweet.write`, `users.read`, and `offline.access`. The callback checks the state cookie, exchanges the code, reads the account, and drops the access token before the response is finished. There is no Supabase project yet, so those tokens are not written to a database, a cookie, local storage, or the repository. A handshake can name the account for that visit. It does not survive a refresh.

The publish id and URL stay in the browser session that sent the post. Refreshing clears them. That is intentional until an audit table exists.

Nothing in the app polls X, searches X, or opens a stream. Gemini is still not connected.

## Future Gemini integration

Gemini, when added, prepares drafts from the evidence pack. It does not choose the classification above the evidence, and it does not approve.

1. Set `GEMINI_API_KEY` in the server environment.
2. Call the model from a server route or server action. Do not expose the key with a `NEXT_PUBLIC_` prefix.
3. Return three versions into the draft studio. The editor still edits, checks the list, and approves.
4. If the model’s wording is stronger than the sources, the editor’s job is to cut it. The product rule does not move.

## Later data

Supabase is the intended store for claims, evidence, draft versions, checklist decisions, OAuth 2.0 tokens, and an audit of who approved what. Until that exists, OAuth 2.0 tokens are discarded after the callback, and a published post id lives only in the browser session that sent it. Refreshing the browser clears session-only actions such as a saved draft or a rejection.

## Sample data

Counts, posts, handles, and evidence cards are demonstration material for the product. They are not a live monitoring feed, and they are not published fact-checks. Where a dossier cites a public figure such as the 2023 INEC register or the 2024 minimum-wage amendment, the surrounding card still belongs to the sample pack. Do not quote this deployment as a newsroom’s finding.
