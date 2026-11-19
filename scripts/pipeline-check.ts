import { readFileSync } from "node:fs";
import { dueForScheduledRun, pipelineDevelopLimit, pipelineFunnelLine, pipelinePlan, scheduleIntervalHours, scheduleRunMaxDurationSeconds, staleScheduleRunningMs } from "../lib/desk/pipeline";
import { canStartScheduledRun, defaultSchedule } from "../lib/desk/schedule";
import { assertScheduleRequest, scheduleSecretConfigured } from "../lib/auth/schedule";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

check("pipeline develop limit stays small", pipelineDevelopLimit === 2);
check("default schedule cannot start", !canStartScheduledRun(defaultSchedule).ok && !dueForScheduledRun(defaultSchedule).ok);
check("armed every-3-hours can start when idle", dueForScheduledRun({
  enabled: true,
  mode: "every-3-hours",
  customHours: null,
  runningSince: null,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastRun: null,
}).ok);
check("interval hours follow the mode", scheduleIntervalHours({ ...defaultSchedule, mode: "every-4-hours" }) === 4 && scheduleIntervalHours({ ...defaultSchedule, mode: "custom", customHours: 6 }) === 6);
check("pipeline plan caps develop ids", pipelinePlan({
  enabled: true,
  mode: "every-3-hours",
  customHours: null,
  runningSince: null,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastRun: null,
}, ["a", "b", "c"]).developIds.length === 2);

const previous = process.env.CRON_SECRET;
process.env.CRON_SECRET = "test-secret";
const allowed = assertScheduleRequest(new Request("https://example.com/api/schedule/run", {
  method: "POST",
  headers: { authorization: "Bearer test-secret" },
}));
const refused = assertScheduleRequest(new Request("https://example.com/api/schedule/run", {
  method: "POST",
  headers: { authorization: "Bearer wrong" },
}));
const sameOrigin = assertScheduleRequest(new Request("https://example.com/api/schedule/run", {
  method: "POST",
  headers: { origin: "https://example.com", host: "example.com", "sec-fetch-site": "same-origin" },
}));
const sameOriginGet = assertScheduleRequest(new Request("https://example.com/api/schedule/run", {
  method: "GET",
  headers: { host: "example.com", "sec-fetch-site": "same-origin" },
}));
check("cron bearer is accepted", allowed === null && scheduleSecretConfigured());
check("bad cron bearer is refused without same-origin", refused?.status === 401);
check("same-origin still works for a forced test run", sameOrigin === null);
check("same-origin GET without Origin still works for a forced test run", sameOriginGet === null);
if (previous === undefined) delete process.env.CRON_SECRET;
else process.env.CRON_SECRET = previous;

const runRoute = readFileSync(new URL("../app/api/schedule/run/route.ts", import.meta.url), "utf8");
const scheduleRoute = readFileSync(new URL("../app/api/schedule/route.ts", import.meta.url), "utf8");
const developRoute = readFileSync(new URL("../app/api/desk/develop/route.ts", import.meta.url), "utf8");
const vercel = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
const publish = readFileSync(new URL("../lib/db/publisher.ts", import.meta.url), "utf8");
const publishRoute = readFileSync(new URL("../app/api/x/publish/route.ts", import.meta.url), "utf8");
const pipeline = readFileSync(new URL("../lib/db/pipeline.ts", import.meta.url), "utf8");
const scheduleDesk = readFileSync(new URL("../components/settings/schedule-desk.tsx", import.meta.url), "utf8");
const approveQueue = readFileSync(new URL("../components/publisher/queue.tsx", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

check("schedule runner is a separate route from develop", runRoute.includes("runBackgroundPipeline") && !/cron|schedule/i.test(developRoute));
check("vercel cron points at the schedule runner", /\/api\/schedule\/run/.test(vercel));
check("schedule arming stays same-origin", scheduleRoute.includes("assertEditorRequest") && scheduleRoute.includes("saveDeskSchedule"));
check("pipeline never publishes", pipeline.includes("posted: false") && !pipeline.includes("publishApprovedPost"));
check("markPublishedOpportunity returns status", /return \{ ok: true as const, count:/.test(publish) && publishRoute.includes("queueCleared"));
check("published update clears queue_rank", publish.includes("queue_rank: null"));
check("schedule run maxDuration is about five minutes", runRoute.includes(`maxDuration = ${scheduleRunMaxDurationSeconds}`) && scheduleRunMaxDurationSeconds === 300);
check("stale schedule lock waits past maxDuration", staleScheduleRunningMs > scheduleRunMaxDurationSeconds * 1000 && pipeline.includes("clearStaleRunningLock"));
check("pipeline persists last run funnel", pipeline.includes("last_run") && pipeline.includes("pipelineFunnelLine"));
check("schedule and approve surface running or empty funnel", scheduleDesk.includes("Last run funnel") && approveQueue.includes("Pipeline is still running") && approveQueue.includes("/api/schedule"));
check("readme documents five-minute schedule ceiling", /300|five minutes|5 minutes/i.test(readme) && /cron-job\.org/i.test(readme));
check("funnel line names scan extract develop ready", /Scan found 4 posts/.test(pipelineFunnelLine({
  scanned: true,
  postsReturned: 4,
  claimsKept: 2,
  queriesRun: 6,
  developAttempted: 2,
  readyCount: 0,
  blockedCount: 2,
})));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("pipeline checks passed");
