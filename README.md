# Political Receipts NG

Politics. Claims. Receipts.

This app is an **approve-only publisher** for three topics: Politics, Finance, and Manchester United.

The background work finds activity, researches checkable claims with numbers and caveats, and drafts a post. You open the queue, read the draft, and approve or reject. Nothing posts without that decision.

## What you use

| Route | Purpose |
| --- | --- |
| `/` | Approval queue. Edit the draft, optionally rephrase with typed or spoken instructions, then exact-text approve or reject. |
| `/published` | Posts that already went out. |
| `/settings` | Account, credentials, and schedule arming (Schedule section: arm cron or Run pipeline once). |

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

`POST/GET /api/schedule/run` authenticates, claims the schedule lock, returns **202 Accepted** quickly, then continues find → research → draft (up to two ranked stories) after the HTTP response via Next.js `after()` (Vercel Fluid `waitUntil`). It never publishes.

The HTTP wait for cron is only auth + lock claim. The long work still runs under the route’s `maxDuration = 300` (five minutes on **Vercel Fluid Hobby or Pro**). A full smart run can do several X searches plus extract and up to two develops; that work continues after cron has already gotten its 202.

After each finished run, Schedule and Approve show a short funnel line (posts found → claims kept → develop attempted → ready). Approve also polls schedule state so an empty queue says “still running” vs “finished with 0 ready” instead of a silent blank.

### Cadence (Vercel Hobby + cron-job.org)

Vercel Hobby only allows daily crons. Every-3-hours expressions such as `0 */3 * * *` are rejected on deploy, so they are not the primary scheduler here.

| Trigger | Schedule | Role |
| --- | --- | --- |
| **cron-job.org** (primary) | Every 3 hours | Calls the schedule runner so armed desks can work on a 3-hour cadence |
| **Vercel cron** (`vercel.json`) | `0 0 * * *` (daily) | Harmless backup only — same endpoint, same due-interval guards |

### Arming (required)

- `desk_schedule.enabled` defaults to **off**. External cron calls no-op until you arm the schedule in **Settings → Schedule**, pick **Every 3 hours** (or 4 / custom), and accept the cost checkbox.
- Cron never publishes. Publishing stays exact-text approve on `/`.
- Same-origin **Settings → Schedule → Run pipeline once** still forces one test run (`force: true`). The HTTP call returns 202 quickly; Schedule shows **Running** until Last finished updates (background work can take up to about five minutes).

### cron-job.org setup

1. Create a job at [cron-job.org](https://cron-job.org).
2. **URL:** `https://political-receipts-ng.vercel.app/api/schedule/run`
3. **Method:** `POST`
4. **Schedule:** every 3 hours (e.g. cron expression `0 */3 * * *`, or the UI’s every-3-hours option)
5. **HTTP timeout:** **30 seconds is OK** (cron-job.org free/plan max). The runner answers within that window; Vercel still allows up to ~300s for the background pipeline.
6. **Timezone:** job timezone is only when the HTTP call fires. Eligibility still uses `lastFinishedAt` + the armed interval (product times are America/Chicago / CT). A call that arrives early is skipped until the interval has elapsed.
7. After the job exists, open **Settings → Schedule**, set interval to **Every 3 hours**, check the cost box, and **Arm schedule**.

#### Advanced / Request headers (required for auth)

On cron-job.org open **Advanced** (or Request headers) and add exactly one header:

| Field | Value |
| --- | --- |
| Header name | `Authorization` |
| Header value | `Bearer <CRON_SECRET>` |

Rules that matter:

- One space after `Bearer`. No quotes around the secret.
- Do **not** put only the raw secret in the header value (that used to look like a fast **401**).
- Do **not** put the secret in the URL query string.
- **Body:** leave empty (or send `{}`). Empty body is fine. Do not send form fields or non-JSON text.
- **Content-Type:** optional when the body is empty. If you send JSON, use `application/json`.

#### What Test Run statuses mean

| Status | Meaning |
| --- | --- |
| **202** | Auth OK, lock claimed, pipeline started in the background. Check Settings → Schedule: **Running** Yes, then **Last finished** when done. |
| **200** with `ok: false` | Auth OK, but the desk skipped work (schedule off, already running, or interval not due yet). Not a cron misconfig. |
| **401** | Missing/wrong `Authorization: Bearer …` (most common Advanced-tab mistake). |
| **400** | Non-empty body that is not valid JSON. Empty body is not a 400. Older builds also returned **400** when the pipeline skipped (`ok: false`); current builds use **200** for skips. |

Apply `supabase/migrations/20261119120000_desk_schedule_last_run.sql` so `desk_schedule.last_run` can store the funnel summary Approve/Schedule read after refresh.

### Secrets and backup

- Set `CRON_SECRET` on the Vercel project. Cron-job.org (and tools) send `Authorization: Bearer <CRON_SECRET>`.
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
