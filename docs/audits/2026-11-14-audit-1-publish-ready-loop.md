# Audit 1 — Publish, prepare, rephrase, same-origin, READY_FOR_EDITOR

Independent explore/security pass over the approve-only closed loop. Severity: BLOCKER / RISK / OK.

## Publish path (`app/api/x/publish/route.ts`, `lib/x/publish.ts`, `lib/x/ticket.ts`, `lib/db/confirmations.ts`, `lib/db/approvals.ts`, `lib/db/publishing.ts`)

| Finding | Severity | Path |
| --- | --- | --- |
| Exact-text gate is enforced: `confirm !== true` rejected; approval text must match; draft hash checked; single-use nonce via `publish_confirmations` + sealed cookie ticket | OK | `lib/x/publish.ts`, `lib/db/approvals.ts`, `lib/db/confirmations.ts`, `lib/x/ticket.ts` |
| Queue UI still sends `confirm: true` only after the checkbox; rephrase never calls publish | OK | `components/publisher/queue.tsx` |
| After a successful X post, `markPublishedOpportunity` is fire-and-forget; errors are ignored so a published post can remain on `/` as READY_FOR_EDITOR | BLOCKER | `app/api/x/publish/route.ts`, `lib/db/publisher.ts` |
| `finishPublication` retention is reported as `retained`; opportunity lifecycle success is not | RISK | `app/api/x/publish/route.ts` |

## Prepare / rephrase (`app/api/publisher/prepare/route.ts`, `app/api/publisher/rephrase/route.ts`, `lib/db/publisher.ts`, `lib/publisher/rephrase.ts`)

| Finding | Severity | Path |
| --- | --- | --- |
| Prepare requires same-origin, READY_FOR_EDITOR, and parsed non-empty text; saves exact final draft then returns claim/draft ids | OK | `app/api/publisher/prepare/route.ts`, `lib/db/publisher.ts` |
| Rephrase is AI-only rewrite; no X call; prompts forbid invented stats | OK | `app/api/publisher/rephrase/route.ts`, `lib/publisher/rephrase.ts` |
| Prepare stores `sources: []`, so final-post metadata drops source URLs already shown on the card (display still uses development links) | RISK | `lib/db/publisher.ts` (`prepareApprovalDraft`) |
| Prepare checks lifecycle only, not `development.ready === true` (queue list filters both) | RISK | `lib/db/publisher.ts`, `lib/publisher/read.ts` |

## Same-origin guards (`lib/x/guard.ts`, `lib/auth/access.ts`, `middleware.ts`)

| Finding | Severity | Path |
| --- | --- | --- |
| Write APIs call `assertEditorRequest`; Origin must match Host; cross-site `sec-fetch-site` refused | OK | `lib/x/guard.ts`, publisher/X/desk/intel routes |
| Password gate removed intentionally; pages are open on the deployment; any browser session on the app origin can write | RISK | `middleware.ts`, `lib/auth/access.ts` |
| No alternate auth for machine/cron callers; a future schedule route cannot use `assertEditorRequest` alone | BLOCKER (for unattended path) | `lib/x/guard.ts` |

## READY_FOR_EDITOR pipeline (`lib/db/develop.ts`, `lib/editorial/develop.ts`, `lib/intel/run.ts`, `app/api/desk/develop/route.ts`, `app/page.tsx`)

| Finding | Severity | Path |
| --- | --- | --- |
| `lifecycleForDevelopment` + `developContent` correctly set READY_FOR_EDITOR when drafts pass the gate | OK | `lib/editorial/develop.ts`, `lib/db/develop.ts` |
| Home `/` lists READY_FOR_EDITOR with `development.ready === true` | OK | `lib/db/publisher.ts`, `app/page.tsx` |
| `runScan` creates opportunities but never calls `developContent`; find→research→draft stops at discovery unless the old desk UI posts to `/api/desk/develop` | BLOCKER | `lib/intel/run.ts`, `app/api/desk/develop/route.ts` |
| Desk is redirected off the product nav; manual develop is not reachable from Approve / Published / Settings | BLOCKER | `lib/nav.ts`, `app/desk/page.tsx` |
| No `publisher_notifications` (or equivalent) when lifecycle becomes READY_FOR_EDITOR | BLOCKER | (missing) |

## Verdict

Closed loop is blocked after discovery: scan does not develop, schedule cannot call writes, published items can stick on Approve, and ready notify does not exist. Publish/prepare/rephrase exact-text and same-origin mechanics are otherwise sound.
