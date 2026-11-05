import { readFileSync } from "node:fs";
import {
  chainLines,
  claimDecision,
  deskJobView,
  editorFailureReason,
  noteFinished,
  noteTrying,
  splitLatestWork,
  type ReprocessJob,
} from "../lib/intel/progress";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

function job(partial: Partial<ReprocessJob> & Pick<ReprocessJob, "phase">): ReprocessJob {
  return {
    id: "job-1",
    scanId: "scan-1",
    requestId: "request-1",
    startedAt: "2026-11-05T11:08:56.720Z",
    finishedAt: null,
    posts: 10,
    conversations: 10,
    opportunities: 0,
    provider: null,
    steps: [],
    ...partial,
  };
}

const started = Date.parse("2026-11-05T11:08:56.720Z");
const preparing = job({ phase: "preparing", startedAt: new Date(started).toISOString() });
check("a click shows processing immediately", deskJobView({ job: preparing, postsSaved: 10, now: started + 500 }).button === "Reprocessing...");
check("processing says the saved posts are being used", deskJobView({ job: preparing, postsSaved: 10, now: started + 500 }).lines.includes("Reprocessing 10 saved posts"));
check("processing promises no new X request", deskJobView({ job: preparing, postsSaved: 10, now: started + 500 }).lines.includes("No new X request will be made."));

const store = new Map<string, ReprocessJob>();
function click(now: number) {
  const current = store.get("scan-1") ?? null;
  if (claimDecision(current, now) === "attach") return { created: false, requestId: current?.requestId ?? "" };
  const created = job({ phase: "extraction", requestId: `request-${store.size + 1}`, startedAt: new Date(now).toISOString() });
  store.set("scan-1", created);
  return { created: true, requestId: created.requestId };
}
const first = click(started);
const second = click(started + 1000);
const refreshed = click(started + 2000);
check("double-click creates one backend operation", first.created && !second.created && first.requestId === second.requestId);
check("refresh during processing does not create another operation", !refreshed.created && refreshed.requestId === first.requestId);

const groqDone = job({
  phase: "complete",
  provider: "groq",
  opportunities: 2,
  finishedAt: "2026-11-05T11:09:20.000Z",
  steps: [{ provider: "groq", state: "succeeded", classification: null }],
});
const success = deskJobView({ job: groqDone, postsSaved: 10, now: started + 30_000 });
check("Groq success updates the desk", success.kind === "complete" && success.lines.includes("Reprocess complete") && success.lines.includes("AI provider: Groq"));
check("a completed reprocess removes the Gemini failure warning", success.lines.every((line) => !line.includes("The model did not answer in time") && !line.includes("AI analysis incomplete")));
check("success counts the stored posts", success.lines.includes("10 posts processed") && success.lines.includes("10 conversations reviewed") && success.lines.includes("2 opportunities found"));

let steps = noteTrying([], "groq");
steps = noteFinished(steps, "groq", "failed", "TIMEOUT");
steps = noteTrying(steps, "openrouter");
const moved = chainLines(steps);
check("Groq timeout moves the visible chain to OpenRouter", moved.includes("Groq failed: Timed out") && moved.includes("Trying OpenRouter..."));

const failed = deskJobView({
  job: job({
    phase: "failed",
    provider: "gemini",
    steps: [
      { provider: "groq", state: "failed", classification: "BAD_REQUEST" },
      { provider: "openrouter", state: "failed", classification: "INVALID_RESPONSE" },
      { provider: "gemini", state: "failed", classification: "PROVIDER_SERVER_ERROR" },
    ],
  }),
  postsSaved: 10,
  now: started + 60_000,
});
check("all-provider failure offers another try", failed.kind === "failed" && failed.button === "Try analysis again" && failed.buttonDisabled === false);
check("failure keeps the posts stored", failed.lines.includes("10 X posts are still safely stored.") && failed.lines.includes("No new X request is needed."));
check("failure names each provider simply", failed.chain.includes("Groq failed: The provider rejected the response") && failed.chain.includes("Gemini failed: The provider was unavailable"));
check("a simple reason does not include an endpoint", !editorFailureReason("BAD_REQUEST").includes("http") && failed.chain.every((line) => !line.includes("api.")));

const slow = deskJobView({ job: preparing, postsSaved: 10, now: started + 11_000 });
check("a long wait says the posts are safe", slow.stillWorking && slow.lines.includes("Still working. Your saved X posts are safe."));
check("waiting does not look like a new provider was started by the browser", slow.chain.length === 0);

const work = splitLatestWork("scan-1", [
  { id: "new", scanId: "scan-1", title: "From this scan" },
  { id: "old", scanId: null, title: "4 stored posts from 4 independent accounts" },
  { id: "other", scanId: "scan-0", title: "Earlier scan" },
]);
check("latest-scan opportunities are separated from older work", work.latest.map((item) => item.id).join(",") === "new" && work.older.map((item) => item.id).join(",") === "old,other");

const status = readFileSync(new URL("../app/api/intel/reprocess/status/route.ts", import.meta.url), "utf8");
const saved = readFileSync(new URL("../lib/intel/saved-scan.ts", import.meta.url), "utf8");
const discover = readFileSync(new URL("../components/desk/discover.tsx", import.meta.url), "utf8");
const view = readFileSync(new URL("../lib/intel/progress.ts", import.meta.url), "utf8");
check("status refresh does not call a provider or X", !status.includes("callProvider") && !status.includes("searchRecent") && !status.includes("api.groq.com") && !status.includes("generativelanguage") && !status.includes("tavily") && !status.includes("brave"));
check("reprocess still makes no X search", !saved.includes("searchRecent") && !saved.includes("api.twitter.com"));
check("the desk polls only our status route", discover.includes("/api/intel/reprocess/status") && view.includes("Reprocessing..."));
check("a stale running job can be started again", claimDecision(job({ phase: "extraction", startedAt: new Date(started).toISOString() }), started + 91_000) === "start");

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("reprocess progress checks passed");
