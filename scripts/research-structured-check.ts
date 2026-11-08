import { readFileSync } from "node:fs";
import { angleFromAnalysis, composeFromAnalysis } from "../lib/editorial/findings";
import { describeSource } from "../lib/editorial/quality";
import { canStartScheduledRun, defaultSchedule, scheduleReadiness } from "../lib/desk/schedule";
import { examineSources } from "../lib/research/examine";
import { investigate } from "../lib/research/investigate";
import { interpretOfficialResponse, loadOfficialSeries, matchStructuredQuestion, sourceRegistry } from "../lib/research/official-series";
import { analyzeSeries, percentChange } from "../lib/research/series";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const posts = JSON.parse(readFileSync("scripts/fixtures/understanding-quality-posts.json", "utf8")) as { posts: Array<{ text: string }> };
const pidgin = posts.posts.find((item) => item.text.includes("e tell me say"))?.text ?? "";
const fixture = JSON.parse(readFileSync("scripts/fixtures/world-bank-ng-fdi.json", "utf8")) as [{ lastupdated?: string }, Array<{ date?: string; value?: number | null; indicator?: { id?: string }; country?: { id?: string } }>];
const dataset = matchStructuredQuestion(pidgin);
const expected = (fixture[1] || [])
  .filter((row) => Number(row.date) >= 2016 && Number(row.date) <= 2026 && typeof row.value === "number" && Number.isFinite(row.value))
  .sort((left, right) => Number(left.date) - Number(right.date));
const read = dataset ? interpretOfficialResponse(fixture, dataset) : { ok: false as const, message: "no dataset" };

check("the foreign-investment post matches the World Bank FDI series", dataset?.id === "world-bank-ng-fdi-net-inflows" && dataset.indicator === "BX.KLT.DINV.CD.WD" && dataset.status === "available");
check("the recorded response parses into the published annual observations", read.ok && read.observations.length === expected.length && read.observations.every((item, index) => item.year === Number(expected[index]?.date) && item.value === expected[index]?.value));
check("2010 through 2015 stay outside the selected range and 2026 is not invented", read.ok && !read.observations.some((item) => item.year < 2016 || item.year > 2025) && read.unpublished.includes(2026) && /2026 is not in the published series/.test(read.passage));
check("the negative 2022 observation is kept", read.ok && read.observations.find((item) => item.year === 2022)?.value === expected.find((row) => row.date === "2022")?.value && (read.observations.find((item) => item.year === 2022)?.value || 0) < 0);
check("source metadata stays on the series", read.ok && read.updated === fixture[0].lastupdated && read.observations.every((item) => item.unit === "current US dollars" && item.basis === "nominal" && item.sourceName === "World Bank"));

const analysis = read.ok ? analyzeSeries(read.observations, "foreign direct investment") : null;
const first = read.ok ? read.observations[0] : null;
const last = read.ok ? read.observations.at(-1) : null;
const recentStart = read.ok ? read.observations.find((item) => item.year === (last?.year || 0) - 2) : null;
const previous = read.ok ? read.observations.find((item) => item.year === (last?.year || 0) - 1) : null;
const ten = analysis?.tenYear;
const three = analysis?.threeYear;
const latest = analysis?.changes.at(-1);
check("the calculations use the recorded observations", Boolean(analysis?.chart) && analysis?.comparable === true && ten?.fromYear === first?.year && ten?.toYear === last?.year && ten?.start === first?.value && ten?.end === last?.value && ten?.absolute === Math.round(((last?.value || 0) - (first?.value || 0)) * 1000) / 1000 && ten?.percent === percentChange(first?.value || 0, last?.value || 0));
check("the latest three years and the latest annual change are calculated from the same table", three?.fromYear === recentStart?.year && three?.toYear === last?.year && three?.start === recentStart?.value && three?.end === last?.value && latest?.fromYear === previous?.year && latest?.toYear === last?.year && latest?.start === previous?.value && latest?.end === last?.value);
check("the chart points are the observations", Boolean(analysis?.chart && read.ok && analysis.chart.points.length === read.observations.length && analysis.chart.points.every((point, index) => point.year === read.observations[index]?.year && point.value === read.observations[index]?.value)));

const quality = describeSource(pidgin);
const investigation = investigate(pidgin, quality);
const examined = read.ok ? examineSources(investigation, [{ title: dataset?.series || "", url: dataset?.pageUrl || "", domain: "data.worldbank.org", opened: true, text: read.passage }]) : null;
const drafted = examined?.analysis?.chart ? composeFromAnalysis({ quality, analysis: examined.analysis, domain: "data.worldbank.org" }) : "";
const angle = examined?.analysis?.chart ? angleFromAnalysis(quality, examined.analysis) : null;
const years = new Set(examined?.analysis?.observations.map((item) => String(item.year)));
check("the application path drafts a post from the opened series", examined?.stage === "EVIDENCE_READY" && /foreign direct investment, net inflows/i.test(drafted) && /\$3\.45bn/.test(drafted) && /\$4\.01bn/.test(drafted) && /does not say why/i.test(drafted) && !/data\.worldbank\.org/.test(drafted) && !/2026 is not in the published series/.test(drafted) && !/\d{10,}/.test(drafted));
check("the draft keeps the rejection and does not invent a year", /did not say foreign companies are not investing/i.test(drafted) && /rejected that/.test(drafted) && [...drafted.matchAll(/\b20\d\d\b/g)].every((match) => years.has(match[0])) && !/because of Tinubu/.test(drafted) && /different windows/.test(angle?.title || "") && /not capital importation/i.test(angle?.title || ""));

check("capital importation is not answered with FDI", matchStructuredQuestion("Nigeria capital importation")?.status === "unavailable" && /not used in its place/.test(matchStructuredQuestion("Nigeria capital importation")?.reason || ""));
check("portfolio, announcements, company counts, CBN, and UNCTAD stay unavailable", ["portfolio investment into Nigeria", "announced investment commitment", "how many companies are investing", "CBN external sector statistics", "UNCTAD foreign direct investment"].every((text) => matchStructuredQuestion(text)?.status === "unavailable"));
async function main() {
  const failed = dataset ? await loadOfficialSeries(dataset, { load: async () => ({ message: "The World Bank API returned 500." }) }) : null;
  const thrown = dataset ? await loadOfficialSeries(dataset, { load: async () => { throw new Error("offline"); } }) : null;
  const missing = await loadOfficialSeries(sourceRegistry.find((item) => item.id === "nbs-capital-importation") || sourceRegistry[0], { load: async () => fixture });
  let calls = 0;
  const repeated = dataset && read.ok ? await loadOfficialSeries(dataset, { alreadyStored: true, storedPassage: read.passage, load: async () => { calls += 1; return fixture; } }) : null;
  const blank = dataset ? interpretOfficialResponse([{ lastupdated: "2026-10-08" }, [{ date: "2026", value: null, indicator: { id: dataset.indicator }, country: { id: "NG" } }]], dataset) : null;
  const wrong = dataset ? interpretOfficialResponse([{ lastupdated: "2026-10-08" }, [{ date: "2024", value: 10, indicator: { id: "OTHER" }, country: { id: "NG" } }]], dataset) : null;
  const mixed = analyzeSeries([
    { series: "Foreign direct investment", year: 2023, value: 10, unit: "current US dollars", basis: "nominal", sourceName: "World Bank", url: "https://data.worldbank.org/indicator/BX.KLT.DINV.CD.WD?locations=NG" },
    { series: "Capital importation", year: 2023, value: 20, unit: "USD million", basis: "nominal", sourceName: "National Bureau of Statistics", url: "https://www.nigerianstat.gov.ng/" },
  ], "foreign direct investment");
  check("a failed API response is reported and not replaced", failed?.ok === false && /Download failed/.test(failed?.message || "") && thrown?.ok === false && /did not answer/.test(thrown?.message || ""));
  check("an unavailable dataset is not fetched", missing.ok === false && missing.fetched === false && /not used in its place/.test(missing.message));
  check("a repeated read uses the stored passage and does not call the API again", repeated?.ok === true && repeated.fetched === false && calls === 0);
  check("a null year and a different indicator are not filled in", blank?.ok === false && wrong?.ok === false);
  check("FDI and capital importation are not compared as one series", mixed?.otherSeries.includes("Capital importation") === true && mixed.series === "Foreign direct investment" && mixed.observations.every((item) => item.series === "Foreign direct investment"));
  const ready = scheduleReadiness({ planSupportsCron: false, xCallsRemaining: null, scanCostKnown: false, researchBudgetKnown: false, modelBudgetKnown: false, editorConfirmed: false });
  const armed = scheduleReadiness({ planSupportsCron: true, xCallsRemaining: 10, scanCostKnown: true, researchBudgetKnown: true, modelBudgetKnown: true, editorConfirmed: true });
  check("scheduling is off until an editor confirms the checks", defaultSchedule.enabled === false && defaultSchedule.mode === "manual" && canStartScheduledRun(defaultSchedule).ok === false && ready.canEnable === false && armed.canEnable === true && armed.reasons.some((item) => /cannot publish/.test(item)));
  check("a running job and a manual mode cannot overlap or start themselves", canStartScheduledRun({ ...defaultSchedule, enabled: true, mode: "every-3-hours", runningSince: "2026-11-07T12:00:00Z" }).ok === false && canStartScheduledRun({ ...defaultSchedule, enabled: true, mode: "manual" }).ok === false && canStartScheduledRun({ ...defaultSchedule, enabled: true, mode: "custom", customHours: 2 }).ok === false);
  const route = readFileSync("app/api/desk/develop/route.ts", "utf8");
  const page = readFileSync("app/desk/page.tsx", "utf8");
  const story = readFileSync("app/desk/work/[id]/page.tsx", "utf8");
  const publish = readFileSync("lib/x/publish.ts", "utf8");
  check("the approval queue replaced the desk steps and the story can still read the official series", page.includes('redirect("/")') && route.includes("read-structured") && story.includes("Read the official series") && readFileSync("app/page.tsx", "utf8").includes("ApprovalQueue"));
  check("publishing still requires the exact confirmation", publish.includes("input.confirm !== true") && publish.includes("The post needs an explicit final confirmation."));
  const migration = readFileSync("supabase/migrations/20261107140000_desk_schedule.sql", "utf8");
  check("the schedule migration defaults to off and blocks a manual enabled row", /enabled boolean not null default false/.test(migration) && /enabled = false or mode <> 'manual'/.test(migration));

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("structured research checks passed");
}

main();
