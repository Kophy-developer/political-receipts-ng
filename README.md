# Political Receipts NG

Politics. Claims. Receipts.

Political Receipts NG is a Nigerian political intelligence and fact-checking desk. It watches political conversation, opens the sentences that can be checked, lays the evidence beside the claim, and prepares posts a human editor can approve.

This version is a working editorial product on demonstration data. It does not call X, it does not call Gemini, and it does not need Supabase. Nothing in the application can publish a political post.

## What this version does

- Briefs the desk: volume, growth, and a queue of open claims.
- Shows a live-intelligence board for Nigerian political topics, with a detail pane for each conversation.
- Opens a dossier for every detected claim: the original post placeholder, evidence cards, and a fact-check that is not allowed to sound more certain than the pack.
- Drafts three versions of a researched claim. A is straight. B is conversational. C is a hook that still has to stay inside the evidence.
- Requires a pre-publication checklist before approval is offered.
- Refuses to post. **Approve & post to X** explains that X is not connected.
- Keeps a sample archive, a source library, analytics computed from that archive, and settings for the connections that come later.

Classifications used on the desk: Verified, Contradicted, Needs Context, Unverified. Formats: `#CheckAm`, `#ShowYourWorking`, and `#NotTrue`. `#NotTrue` is reserved for claims the evidence clearly contradicts.

No political party is treated as a trusted source.

## Architecture

```
app/                  App Router pages and the X callback
components/           Desk shell and the editorial screens
lib/                  Sample investigations, drafts, archive, source policy
```

The interface is a Next.js App Router application. Pages that can be static are static. Interaction (filters, draft selection, the approval gate) stays in the browser and writes nothing to a server. The sample investigations live in `lib/` so the product can deploy with an empty environment.

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
| `/api/auth/x/callback` | Reserved OAuth callback. It does not read codes or store tokens. |

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

The desk runs with no environment variables. Copy the example file only when you are ready to add credentials later:

```bash
cp .env.example .env.local
```

Do not commit `.env.local`. `.env.example` is the only env file that belongs in git, and it contains empty placeholders.

## Environment variables

All of these are optional in this version. None of them are read by the running app yet.

| Variable | Where it will be used |
| --- | --- |
| `X_CLIENT_ID` | Server-side X OAuth client id |
| `X_CLIENT_SECRET` | Server-side X OAuth client secret |
| `X_API_KEY` | Server-side X API key |
| `X_API_SECRET` | Server-side X API secret |
| `X_ACCESS_TOKEN` | Server-side user token, if a later flow uses user context |
| `X_ACCESS_TOKEN_SECRET` | Server-side token secret |
| `GEMINI_API_KEY` | Server-side Gemini key for draft preparation |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase anon key, safe to expose only because row-level security must restrict it |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never prefix it with `NEXT_PUBLIC_` and never import it into a client component. |

X and Gemini secrets must stay on the server. The settings screen shows disabled placeholders. It does not accept or store a key.

## Deployment

The app is a standard Next.js project and deploys on Vercel with no required environment variables.

1. Push the repository to GitHub.
2. Import it in Vercel. Framework preset: Next.js. Root directory: the repository root.
3. Leave the environment empty for this version.
4. Deploy.

After the production URL exists, the X developer portal can be pointed at:

- Website URL: `https://[your-vercel-domain]`
- Callback URL: `https://[your-vercel-domain]/api/auth/x/callback`

The callback route answers `GET` with a short page that says authentication is not configured. It does not echo query parameters, so a code or token in the URL is never written back into the response. `POST` returns HTTP 501 and the same refusal. Hitting the callback does not connect an account.

## Future X integration

When you connect X, do it on the server.

1. Create the app in the X developer portal and set the website and callback URLs above.
2. Put `X_CLIENT_ID` and `X_CLIENT_SECRET` in the Vercel project environment, not in the client bundle.
3. Start OAuth from a server route. Finish it in `/api/auth/x/callback`, exchange the code on the server, and store tokens in a server-side store.
4. Keep the editor gate. A successful token must not mean a draft posts itself. The checklist and an explicit approval stay in front of any write to the X API.

This repository does not connect X.

## Future Gemini integration

Gemini, when added, prepares drafts from the evidence pack. It does not choose the classification above the evidence, and it does not approve.

1. Set `GEMINI_API_KEY` in the server environment.
2. Call the model from a server route or server action. Do not expose the key with a `NEXT_PUBLIC_` prefix.
3. Return three versions into the draft studio. The editor still edits, checks the list, and approves.
4. If the model’s wording is stronger than the sources, the editor’s job is to cut it. The product rule does not move.

## Later data

Supabase is the intended store for claims, evidence, draft versions, checklist decisions, and an audit of who approved what. Until that exists, the desk you are looking at is the sample set in `lib/`. Refreshing the browser clears session-only actions such as a saved draft or a rejection.

## Sample data

Counts, posts, handles, and evidence cards are demonstration material for the product. They are not a live monitoring feed, and they are not published fact-checks. Where a dossier cites a public figure such as the 2023 INEC register or the 2024 minimum-wage amendment, the surrounding card still belongs to the sample pack. Do not quote this deployment as a newsroom’s finding.
