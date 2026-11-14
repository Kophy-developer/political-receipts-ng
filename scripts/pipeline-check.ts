import { readFileSync } from "node:fs";
import { dueForScheduledRun, pipelineDevelopLimit, pipelinePlan, scheduleIntervalHours } from "../lib/desk/pipeline";
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
}).ok);
check("interval hours follow the mode", scheduleIntervalHours({ ...defaultSchedule, mode: "every-4-hours" }) === 4 && scheduleIntervalHours({ ...defaultSchedule, mode: "custom", customHours: 6 }) === 6);
check("pipeline plan caps develop ids", pipelinePlan({
  enabled: true,
  mode: "every-3-hours",
  customHours: null,
  runningSince: null,
  lastStartedAt: null,
  lastFinishedAt: null,
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
check("cron bearer is accepted", allowed === null && scheduleSecretConfigured());
check("bad cron bearer is refused without same-origin", refused?.status === 401);
check("same-origin still works for a forced test run", sameOrigin === null);
if (previous === undefined) delete process.env.CRON_SECRET;
else process.env.CRON_SECRET = previous;

const runRoute = readFileSync(new URL("../app/api/schedule/run/route.ts", import.meta.url), "utf8");
const scheduleRoute = readFileSync(new URL("../app/api/schedule/route.ts", import.meta.url), "utf8");
const developRoute = readFileSync(new URL("../app/api/desk/develop/route.ts", import.meta.url), "utf8");
const vercel = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
const publish = readFileSync(new URL("../lib/db/publisher.ts", import.meta.url), "utf8");
const publishRoute = readFileSync(new URL("../app/api/x/publish/route.ts", import.meta.url), "utf8");
const pipeline = readFileSync(new URL("../lib/db/pipeline.ts", import.meta.url), "utf8");

check("schedule runner is a separate route from develop", runRoute.includes("runBackgroundPipeline") && !/cron|schedule/i.test(developRoute));
check("vercel cron points at the schedule runner", /\/api\/schedule\/run/.test(vercel));
check("schedule arming stays same-origin", scheduleRoute.includes("assertEditorRequest") && scheduleRoute.includes("saveDeskSchedule"));
check("pipeline never publishes", pipeline.includes("posted: false") && !pipeline.includes("publishApprovedPost"));
check("markPublishedOpportunity returns status", /return \{ ok: true as const, count:/.test(publish) && publishRoute.includes("queueCleared"));
check("published update clears queue_rank", publish.includes("queue_rank: null"));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("pipeline checks passed");
