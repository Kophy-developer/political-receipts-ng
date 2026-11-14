# Political Receipts NG

Politics. Claims. Receipts.

This app is an **approve-only publisher** for three topics: Politics, Finance, and Manchester United.

The background work finds activity, researches checkable claims with numbers and caveats, and drafts a post. You open the queue, read the draft, and approve or reject. Nothing posts without that decision.

## What you use

| Route | Purpose |
| --- | --- |
| `/` | Approval queue. Edit the draft, optionally rephrase with typed or spoken instructions, then exact-text approve or reject. |
| `/published` | Posts that already went out. |
| `/settings` | Account, credentials, and schedule arming. |

Older desk routes still exist in the repo for internal tooling and redirects. They are not the product.

## Publishing rule

You can edit the draft yourself, or tell the AI how to rewrite it (type or speak). Rephrase never posts. Approve still sends only the exact text you confirmed; `confirm` must be true on the server. Source links stay beside the draft; they are not silently rewritten into the post.

## Ready notifications (no email vendor)

When a draft becomes `READY_FOR_EDITOR`, Supabase stores a row in `publisher_notifications` (SQL trigger plus write-path upsert). Realtime is enabled on that table.

- Approve home shows a banner when unread ready notifications exist and marks them read when you view the queue.
- The Approve nav item shows an unread badge.
- With the tab backgrounded, the browser Notification API may alert after permission is granted.
- There is no Resend, SendGrid, Postmark, or Auth magic-link notify path.

Apply `supabase/migrations/20261114120000_publisher_notifications.sql` on the existing project.

## Background pipeline

`POST/GET /api/schedule/run` runs find → research → draft (up to two ranked stories). It never publishes.

- `vercel.json` registers a every-3-hours cron hitting that path.
- `desk_schedule.enabled` defaults to **off**. Cron calls no-op until you arm the schedule in Settings and accept the cost checkbox.
- Set `CRON_SECRET` on the server. Cron (and tools) send `Authorization: Bearer <CRON_SECRET>`. Same-origin Settings can force one test run.
- Ready drafts land on `/` and create notifications as above.

## Local development

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run check:desk
npm run build
```

There is no editor password. Writes must come from the app itself (same-origin), except the schedule runner which also accepts `CRON_SECRET`. X publishing needs the X credentials already used by this project. The same Supabase database and Vercel project stay in place.
