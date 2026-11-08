# Political Receipts NG

Politics. Claims. Receipts.

This app is an **approve-only publisher** for three topics: Politics, Finance, and Manchester United.

The background work finds activity, researches checkable claims with numbers and caveats, and drafts a post. You open the queue, read the draft, and approve or reject. Nothing posts without that decision.

## What you use

| Route | Purpose |
| --- | --- |
| `/` | Approval queue. Edit the draft, optionally rephrase with typed or spoken instructions, then exact-text approve or reject. |
| `/published` | Posts that already went out. |
| `/settings` | Account and credentials. |

Older desk routes still exist in the repo for internal tooling and redirects. They are not the product.

## Publishing rule

You can edit the draft yourself, or tell the AI how to rewrite it (type or speak). Rephrase never posts. Approve still sends only the exact text you confirmed; `confirm` must be true on the server. Source links stay beside the draft; they are not silently rewritten into the post.

## Local development

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run check:desk
npm run build
```

There is no editor password. Writes must come from the app itself (same-origin). X publishing needs the X credentials already used by this project. The same Supabase database and Vercel project stay in place.
