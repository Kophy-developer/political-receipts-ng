import { readFileSync } from "node:fs";
import { initialDevelopment, lifecycleForDevelopment } from "../lib/editorial/develop";
import { describeSource } from "../lib/editorial/quality";
import { storyReading } from "../lib/desk/research-state";
import { describeContinuation } from "../lib/research/resume";
import { investigate } from "../lib/research/investigate";
import { sourceRegistry, retrieveWorldBank, type StructuredDataset } from "../lib/research/official-series";
import { prepareOfficialDevelopment } from "../lib/research/official-workflow";
import { analyzeSeries, percentChange } from "../lib/research/series";
import {
  csvToWorldBankBody,
  recordedFdiUpdated,
  recordedFdiVerified,
  recordedFdiVersion,
  resolveOfficialSeries,
  verifyOfficialBody,
  type StructuredRecord,
} from "../lib/research/structured-cache";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const now = "2026-11-07T13:05:29.000Z";
const fixture = JSON.parse(readFileSync("scripts/fixtures/world-bank-ng-fdi.json", "utf8"));
const csv = readFileSync("scripts/fixtures/world-bank-ng-fdi.csv", "utf8");
const dataset = sourceRegistry.find((item) => item.id === "world-bank-ng-fdi-net-inflows") as StructuredDataset;
const posts = JSON.parse(readFileSync("scripts/fixtures/understanding-quality-posts.json", "utf8")) as { posts: Array<{ text: string }> };
const pidgin = posts.posts.find((item) => item.text.includes("e tell me say"))?.text ?? "";

function cacheFrom(record: StructuredRecord, retrievedAt: string): StructuredRecord {
  const checked = verifyOfficialBody(record.originalResponse, dataset, { now, origin: "cached", retrievedAt, requestUrl: dataset.apiUrl });
  if (!checked.ok) throw new Error(checked.reason);
  return checked.record;
}

async function main() {
  const verified = recordedFdiVerified(now);
  check("the recorded World Bank file matches the pinned FDI series", verified.ok && verified.record.dataVersion === recordedFdiVersion && verified.record.sourceUpdated === recordedFdiUpdated && verified.record.live === false && verified.record.years.length === 10 && !verified.record.years.includes(2026) && verified.record.observations.some((item) => item.year === 2022 && item.value < 0));
  const tampered = JSON.parse(JSON.stringify(fixture));
  tampered[1][0].value = 1;
  check("a changed observation is not accepted as the recorded series", verifyOfficialBody(tampered, dataset, { now, origin: "recorded", retrievedAt: null, pin: recordedFdiVersion }).ok === false);
  check("a response without the World Bank indicator is unverified", verifyOfficialBody([{ lastupdated: "2026-10-08", sourceid: "2" }, [{ date: "2024", value: 10, indicator: { id: "OTHER" }, country: { id: "NG" } }]], dataset, { now, origin: "cached", retrievedAt: now }).ok === false);

  let liveCalls = 0;
  const live = await resolveOfficialSeries(dataset, { mode: "live", now, recordedBody: fixture, load: async () => { liveCalls += 1; return fixture; } });
  check("a live JSON response stays labeled as a live retrieval", live.ok && live.live && live.record.origin === "live" && liveCalls === 1 && /Live World Bank retrieval/.test(live.record.label));

  let httpCalls = 0;
  const cached = verified.ok ? cacheFrom(verified.record, now) : null;
  const httpFailed = await resolveOfficialSeries(dataset, { mode: "live", now, cache: cached, load: async () => { httpCalls += 1; return { message: "The World Bank API returned 503." }; } });
  check("an HTTP failure uses the validated cache and does not call it live", httpFailed.ok && httpFailed.live === false && httpCalls === 1 && /Not a live retrieval/.test(httpFailed.record.label) && /returned 503/.test(httpFailed.record.label) && httpFailed.record.dataVersion === recordedFdiVersion);

  let timeoutCalls = 0;
  const timedOut = await resolveOfficialSeries(dataset, {
    mode: "live",
    now,
    cache: cached,
    load: async () => {
      timeoutCalls += 1;
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    },
  });
  check("a timeout uses the validated cache", timedOut.ok && timedOut.live === false && timeoutCalls === 1 && /timeout/.test(timedOut.record.label) && /Not a live retrieval/.test(timedOut.record.label));

  const csvBody = csvToWorldBankBody(csv, dataset);
  const csvRecord = csvBody ? verifyOfficialBody(csvBody, dataset, { now, origin: "csv", retrievedAt: now, pin: recordedFdiVersion, requestUrl: dataset.apiUrl }) : null;
  check("the CSV download parses to the same verified observations", csvRecord?.ok === true && csvRecord.record.dataVersion === recordedFdiVersion && csvRecord.record.live === false);
  let csvCalls = 0;
  const csvFallback = await resolveOfficialSeries(dataset, { mode: "live", now, load: async () => { csvCalls += 1; return { message: "The World Bank API returned 500.", csv }; } });
  check("a failed JSON response can use one verified CSV body", csvFallback.ok && csvFallback.record.origin === "csv" && csvFallback.live === false && csvCalls === 1 && csvFallback.record.dataVersion === recordedFdiVersion);

  let missingCalls = 0;
  const missing = await resolveOfficialSeries(dataset, { mode: "saved", now, load: async () => { missingCalls += 1; return fixture; } });
  const unverified = await resolveOfficialSeries(dataset, { mode: "saved", now, cache: cached ? { ...cached, dataVersion: "not-the-series", indicator: "OTHER" } : null, load: async () => { missingCalls += 1; return fixture; } });
  check("a missing or unverified cache does not become a series and does not retrieve", missing.ok === false && unverified.ok === false && missingCalls === 0);

  const staleCache = verified.ok ? cacheFrom(verified.record, "2025-01-01T00:00:00.000Z") : null;
  const stale = await resolveOfficialSeries(dataset, { mode: "saved", now, cache: staleCache, load: async () => { throw new Error("stale must not retrieve"); } });
  check("a stale validated cache is labeled and still keeps the observations", stale.ok && stale.record.stale && /older than 120 days/.test(stale.record.label) && stale.record.live === false && stale.record.observations.length === 10);

  let repeatCalls = 0;
  const first = await resolveOfficialSeries(dataset, { mode: "saved", now, recordedBody: fixture, load: async () => { repeatCalls += 1; return fixture; } });
  const second = await resolveOfficialSeries(dataset, { mode: "saved", now, recordedBody: fixture, load: async () => { repeatCalls += 1; return fixture; } });
  check("a repeated saved read does not retrieve again", first.ok && second.ok && first.record.dataVersion === second.record.dataVersion && repeatCalls === 0);

  const record = first.ok ? first.record : null;
  const prepared = record ? prepareOfficialDevelopment({ sourceText: pidgin, record }) : null;
  const analysis = prepared?.analysis ?? null;
  const firstYear = analysis?.observations[0];
  const lastYear = analysis?.observations.at(-1);
  const readyState = prepared?.ready ? { ...initialDevelopment(pidgin), ready: true, unresolved: prepared.provenance.label } : null;
  const reading = readyState ? storyReading({ ready: true, unresolved: readyState.unresolved, lifecycle: lifecycleForDevelopment(readyState) }) : null;
  check("the development workflow drafts from the saved series", prepared?.ready === true && prepared.stage === "EVIDENCE_READY" && lifecycleForDevelopment(readyState || initialDevelopment(pidgin)) === "READY_FOR_EDITOR" && reading?.state === "Ready for You" && analysis?.chart?.points.length === 10 && analysis.tenYear?.fromYear === 2016 && analysis.tenYear.toYear === 2025 && analysis.tenYear.percent === percentChange(firstYear?.value || 0, lastYear?.value || 0) && !analysis.observations.some((item) => item.year === 2026));
  const draft = prepared?.draft || "";
  check("the draft keeps the attribution and does not claim a cause or a live retrieval", /did not say foreign companies are not investing/i.test(draft) && /does not say why/i.test(draft) && /Not a live retrieval/.test(draft) && /2026 is not in the published series/.test(draft) && !/because of Tinubu, inflows/i.test(draft));
  const same = analysis ? analyzeSeries(analysis.observations, "foreign direct investment") : null;
  check("the chart years are the saved observations", same?.threeYear?.fromYear === 2023 && same.threeYear.toYear === 2025 && same.changes.at(-1)?.fromYear === 2024 && same.changes.at(-1)?.toYear === 2025);

  const quality = describeSource(pidgin);
  const offer = describeContinuation({
    claim: pidgin,
    sourceText: pidgin,
    investigation: investigate(pidgin, quality),
    sources: [],
    runs: [{ hash: "saved", status: "completed", operations: 1 }],
    continuations: 1,
    searchCompleted: true,
    liveStructuredFailed: true,
  });
  check("a failed live read offers the saved series and no new request", offer.savedData && offer.available && offer.searches === 0 && offer.documents === 0 && offer.structuredId === "world-bank-ng-fdi-net-inflows" && /does not call the API/.test(offer.why));

  const attempts: string[] = [];
  function mockFetch(behavior: "json" | "timeout-then-json" | "timeout-then-csv" | "http-then-csv" | "down"): typeof fetch {
    return async (input) => {
      const url = String(input);
      attempts.push(url);
      const jsonUrl = url.includes("format=json");
      if (behavior === "json" || (behavior === "timeout-then-json" && attempts.filter((item) => item.includes("format=json")).length === 2)) {
        return new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (behavior === "timeout-then-csv" && !jsonUrl) return new Response(csv, { status: 200, headers: { "content-type": "text/csv" } });
      if (behavior === "http-then-csv" && jsonUrl) return new Response("nope", { status: 503, headers: { "content-type": "text/html" } });
      if (behavior === "http-then-csv" && !jsonUrl) return new Response(csv, { status: 200, headers: { "content-type": "text/csv" } });
      if (behavior === "down") return new Response("down", { status: 503, headers: { "content-type": "text/html" } });
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    };
  }
  attempts.length = 0;
  const jsonOk = await retrieveWorldBank(dataset, mockFetch("json"));
  check("one successful JSON response does not continue", jsonOk.ok && jsonOk.format === "json" && attempts.length === 1);
  attempts.length = 0;
  const retried = await retrieveWorldBank(dataset, mockFetch("timeout-then-json"));
  check("a timeout is retried once and then stops when JSON arrives", retried.ok && retried.format === "json" && attempts.length === 2);
  attempts.length = 0;
  const csvAttempt = await retrieveWorldBank(dataset, mockFetch("timeout-then-csv"));
  check("two timeouts fall through to one CSV request", csvAttempt.ok && csvAttempt.format === "csv" && attempts.length === 3 && attempts.filter((item) => item.includes("format=csv")).length === 1);
  attempts.length = 0;
  const httpThenCsv = await retrieveWorldBank(dataset, mockFetch("http-then-csv"));
  check("an HTTP failure is not retried before the CSV fallback", httpThenCsv.ok && httpThenCsv.format === "csv" && attempts.length === 2 && attempts[0].includes("format=json"));
  attempts.length = 0;
  const down = await retrieveWorldBank(dataset, mockFetch("down"));
  check("a failed JSON and CSV stop after those attempts", down.ok === false && attempts.length === 2 && /503/.test(down.message) && down.attempts.some((item) => item.status === 503 && item.contentType === "text/html" && item.json === false));

  const route = readFileSync("app/api/desk/develop/route.ts", "utf8");
  const page = readFileSync("app/desk/work/[id]/page.tsx", "utf8");
  const publish = readFileSync("lib/x/publish.ts", "utf8");
  check("the story can resume from saved data and publishing still needs the exact text", route.includes("resume-saved") && page.includes("Resume with validated saved data") && page.includes("Not a live retrieval") && publish.includes("input.confirm !== true"));

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("structured cache checks passed");
}

main();
