# Audit 2 — Schedule/cron, query evidence, markPublishedOpportunity

Second independent pass focused on unattended runs and evidence rules.

## Schedule / cron (`lib/desk/schedule.ts`, `lib/db/schedule.ts`, `supabase/migrations/20261107140000_desk_schedule.sql`)

| Finding | Severity | Path |
| --- | --- | --- |
| Schedule defaults off (`enabled false`, `mode manual`); DB constraint blocks enabled+manual | OK | `supabase/migrations/20261107140000_desk_schedule.sql`, `lib/desk/schedule.ts` |
| Readiness helper correctly refuses enable without cron + budgets + editor confirm; always reminds that schedule cannot publish | OK | `lib/desk/schedule.ts` |
| No `vercel.json` cron, no `/api/cron` or `/api/schedule` route, no runner that loads `desk_schedule` and executes scan/develop | BLOCKER | (missing) vs `lib/db/schedule.ts` |
| Settings UI has no arm/disarm schedule controls; `loadDeskSchedule` is unused by product routes | BLOCKER | `components/settings/panel.tsx`, `lib/db/schedule.ts` |
| `develop-check` asserts the develop route itself stays manual (no cron inside it) — correct separation, but nothing else implements the runner | RISK → becomes OK once a separate schedule API exists | `scripts/develop-check.ts`, `app/api/desk/develop/route.ts` |

## Query evidence rules (`lib/intel/query-library.ts`, `lib/intel/query-evidence.ts`, `lib/db/query-selection.ts`, `lib/intel/engagement.ts`)

| Finding | Severity | Path |
| --- | --- | --- |
| Auto selection prefers stored samples; unsampled groups are not treated as promising; reasons/limitations are explicit | OK | `lib/intel/query-library.ts` |
| Tightened queries and engagement operators come from stored evidence / configured minimums; no invented keyword free-for-all | OK | `lib/intel/query-evidence.ts`, `lib/intel/engagement.ts` |
| Editor preference override is labeled as bypassing evidence ranking | OK | `lib/intel/query-library.ts`, `lib/db/query-selection.ts` |
| Engagement miss message is clear; operator is sent inside the X query | OK | `lib/intel/engagement.ts`, `lib/intel/run.ts` |

## markPublishedOpportunity (`lib/db/publisher.ts`, `app/api/x/publish/route.ts`)

| Finding | Severity | Path |
| --- | --- | --- |
| Updates `lifecycle` to PUBLISHED only while still READY_FOR_EDITOR for that `claim_id` | OK (shape) | `lib/db/publisher.ts` |
| Returns `void`; ignores missing DB, PostgREST errors, and zero-row updates | BLOCKER | `lib/db/publisher.ts` |
| Publish route always returns `ok: true` after X succeeds even if opportunity was not marked; Approve queue can show a live post again | BLOCKER | `app/api/x/publish/route.ts` |
| Does not clear `queue_rank` / `pass_reason` fields the reject path uses | RISK | `lib/db/publisher.ts` vs `rejectReadyDraft` |

## Hands-off product surface

| Finding | Severity | Path |
| --- | --- | --- |
| Product nav is Approve / Published / Settings only | OK | `lib/nav.ts` |
| Background find→READY_FOR_EDITOR is not runnable without desk UI or a schedule runner | BLOCKER | `lib/intel/run.ts`, missing schedule API |
| No in-app ready badge / Realtime / browser notification path | BLOCKER | (missing) |

## Verdict

Schedule scaffolding is safe-by-default but not a real unattended path. Query evidence rules look intentional and non-inventive. `markPublishedOpportunity` failure modes break the Approve queue after a successful publish and must be fixed with the notify + pipeline work.
