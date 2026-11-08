import { readFileSync } from "node:fs";
import { advanceDevelopment, initialDevelopment, judgeDevelopmentDrafts, type DevelopmentPorts } from "../lib/editorial/develop";
import { composeFromAnalysis, composeOpinion } from "../lib/editorial/findings";
import { describeSource } from "../lib/editorial/quality";
import { isPollingUnitStory, legacyPollingLines } from "../lib/drafts/legacy-polling";
import { chooseDocumentIds, examineSources } from "../lib/research/examine";
import { extractDocument } from "../lib/research/extract";
import { investigate } from "../lib/research/investigate";
import { classifyEvidence } from "../lib/research/relevance";
import { analyzeSeries, percentChange } from "../lib/research/series";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const posts = JSON.parse(readFileSync("scripts/fixtures/understanding-quality-posts.json", "utf8")) as { posts: Array<{ text: string }> };
const pidgin = posts.posts.find((item) => item.text.includes("e tell me say"))?.text ?? "";
const eventPost = posts.posts.find((item) => item.text.includes("Sultan"))?.text ?? "";
const prediction = posts.posts.find((item) => item.text.includes("no way Tinubu will survive"))?.text ?? "";
const capitalHtml = readFileSync("scripts/fixtures/capital-importation.html", "utf8");
const gapCsv = readFileSync("scripts/fixtures/investment-gap.csv", "utf8");
const mixedHtml = readFileSync("scripts/fixtures/investment-mixed.html", "utf8");
const stateHouseHtml = readFileSync("scripts/fixtures/statehouse-investment.html", "utf8");
const capitalUrl = "https://nigerianstat.gov.ng/capital-importation";

const quality = describeSource(pidgin);
const plan = investigate(pidgin, quality);
check("pidgin rejection is not rewritten as the author's investment claim", plan.authorAssertsQuotedClaim === false && /not recorded as saying foreign companies are not investing/i.test(plan.attribution) && /rejects another person's/i.test(quality.summary));
check("the investment plan asks for ten-year and three-year comparisons", plan.questions.some((item) => item.purpose === "historical_comparison") && plan.questions.some((item) => item.purpose === "numerical_analysis") && plan.definitions.some((item) => /capital importation/i.test(item)));

const snippets = examineSources(plan, [{
  title: "President welcomes foreign investors",
  url: "https://statehouse.gov.ng/investors",
  domain: "statehouse.gov.ng",
  opened: false,
  snippet: "foreign companies are investing",
}]);
check("search results alone are not statistics", snippets.stage === "SEARCH_COMPLETED" && snippets.analysis === null && snippets.sources.every((item) => item.stance === "does_not_address"));

const opened = extractDocument({ html: capitalHtml, url: capitalUrl, title: "Capital importation into Nigeria" });
check("the fixture table parses ten annual observations", opened.observations.length === 10 && opened.observations.every((item) => item.sourceName === "National Bureau of Statistics"));
const analysis = analyzeSeries(opened.observations, "capital importation");
check("ten-year and three-year changes use the opened values", analysis?.tenYear?.absolute === 400 && analysis.tenYear.percent === percentChange(5000, 5400) && analysis.threeYear?.fromYear === 2023 && analysis.threeYear.percent === percentChange(3900, 5400));
check("the latest year-on-year change is calculated from the table", analysis?.changes.some((item) => item.fromYear === 2024 && item.toYear === 2025 && item.absolute === -700 && item.percent === percentChange(6100, 5400)) === true);
check("the chart uses only stored points", analysis?.chart?.points.length === 10 && analysis.chart.points.every((point, index) => point.year === opened.observations[index]?.year && point.value === opened.observations[index]?.value));

const gap = analyzeSeries(extractDocument({ csv: gapCsv, text: "National Bureau of Statistics. Capital importation, USD million. Nominal." }).observations, "capital importation");
check("missing years are not manufactured", gap?.missingYears.includes(2018) === true && gap.missingYears.includes(2019) === true && gap.changes.every((item) => item.toYear - item.fromYear === 1));

const mixed = analyzeSeries(extractDocument({ html: mixedHtml }).observations, "capital importation");
check("FDI is not averaged into capital importation", mixed?.observations[0]?.value === 5000 && mixed.otherSeries.some((name) => /foreign direct investment/i.test(name)) && /not treated as the same measurement/i.test(mixed.limitations.join(" ")));

const press = examineSources(plan, [{
  title: "President welcomes foreign investors",
  url: "https://statehouse.gov.ng/investors",
  domain: "statehouse.gov.ng",
  opened: true,
  text: stateHouseHtml,
}]);
check("an opened State House page is not a statistical dataset", press.stage === "EVIDENCE_INSUFFICIENT" && press.sources[0]?.stance === "does_not_address" && press.analysis?.chart == null);

const unopened = classifyEvidence({
  premises: ["foreign companies don Dey invest in Nigeria"],
  sources: [{ title: "Capital importation", url: capitalUrl, domain: "nigerianstat.gov.ng", snippet: "capital importation", opened: false }],
  searchCompleted: true,
});
check("an unopened page cannot establish the series", unopened.evidenceStatus !== "EVIDENCE_READY");

const opinion = describeSource("I think this government is arrogant and out of touch.");
const opinionPlan = investigate(opinion.summary, opinion);
check("a subjective opinion is not given a factual verdict", opinion.researchNeed === "no" && opinion.primaryKind === "opinion" && /subjective judgment/i.test(opinion.reason) && opinionPlan.questions[0]?.purpose === "context");
const opinionDraft = composeOpinion(opinion.summary);
const opinionState = initialDevelopment("I think this government is arrogant and out of touch.");
check("the opinion draft avoids a robotic factual dismissal", judgeDevelopmentDrafts(opinionState, [{ text: opinionDraft }]).ok && !/no independent confirmation of this subjective assessment/i.test(opinionDraft));

const eventPlan = investigate(eventPost, describeSource(eventPost));
check("a reported event is separated from praise", eventPlan.questions.some((item) => item.purpose === "event_investigation") && /commentary|praise|other lines/i.test(`${eventPlan.attribution} ${describeSource(eventPost).summary}`));

const predictionPlan = investigate(prediction, describeSource(prediction));
check("a prediction is not an election forecast", /forecast/i.test(predictionPlan.attribution) && predictionPlan.questions.every((item) => item.purpose !== "verification"));

const polling = "INEC added 453 polling units and the register had AI-generated photographs.";
check("the polling-unit story keeps its own rules", isPollingUnitStory(polling) && legacyPollingLines().some((line) => line.includes("453")) && investigate(polling, describeSource(polling)).questions.every((item) => !/capital importation/i.test(item.question)));

const chosen = chooseDocumentIds([
  { id: "house", url: "https://statehouse.gov.ng/investors", title: "President welcomes foreign investors", domain: "statehouse.gov.ng", snippet: "investing", retrievalStatus: "not_retrieved", inDomain: true },
  { id: "nbs", url: capitalUrl, title: "Capital importation", domain: "nigerianstat.gov.ng", snippet: "National Bureau of Statistics capital importation", retrievalStatus: "not_retrieved", inDomain: true },
], plan, 2);
check("a statistical source is chosen ahead of a press release", chosen[0] === "nbs" && !chosen.includes("house"));

const examined = examineSources(plan, [{
  title: "Capital importation into Nigeria",
  url: capitalUrl,
  domain: "nigerianstat.gov.ng",
  opened: true,
  text: capitalHtml,
}]);
check("opened relevant figures become evidence", examined.stage === "EVIDENCE_READY" && examined.stagesReached.includes("EVIDENCE_EXAMINED") && examined.analysis?.chart?.metric === "Capital importation");

async function main() {
let researchCalls = 0;
const ports: DevelopmentPorts = {
  research: async () => {
    researchCalls += 1;
    return { ok: true, called: true, label: "usable", sources: examined.sources, message: "Opened the fixture table." };
  },
  draft: async ({ analysis }) => ({
    ok: true,
    called: false,
    drafts: [{ style: "conversational", text: analysis ? composeFromAnalysis({ quality, analysis, domain: "nigerianstat.gov.ng" }) : "" }],
    message: "Drafted from the series.",
  }),
};
const developed = await advanceDevelopment(initialDevelopment(pidgin), ports);
const draft = developed.drafts[0]?.text ?? "";
check("development reaches Ready for You with the calculated figures", developed.ready === true && /\$5\.40bn/.test(draft) && /\$5\.00bn/.test(draft) && !/nigerianstat\.gov\.ng/.test(draft));
check("the draft does not invent the author's position or a cause", /did not say foreign companies are not investing/i.test(draft) && /does not say why/i.test(draft) && !/because of Tinubu/.test(draft));
check("the angle is a finding rather than a generic instruction", /capital importation/i.test(developed.angle || "") && !/keep the claim with the speaker/i.test(developed.angle || ""));

const failed: typeof developed = { ...developed, draftFailed: true, ready: false, completed: developed.completed.filter((item) => item !== "draft"), drafts: [] };
let retryResearch = 0;
const retried = await advanceDevelopment(failed, {
  research: async () => {
    retryResearch += 1;
    return { ok: true, called: true, label: "usable", sources: examined.sources, message: "should not run" };
  },
  draft: async ({ analysis }) => ({
    ok: true,
    called: false,
    drafts: [{ style: "conversational", text: analysis ? composeFromAnalysis({ quality, analysis, domain: "nigerianstat.gov.ng" }) : "missing" }],
    message: "Drafted again from stored evidence.",
  }),
});
check("a draft failure keeps the opened series and does not search again", retryResearch === 0 && retried.ready && retried.analysis?.series === "Capital importation" && researchCalls === 1);

const publishRoute = readFileSync("app/api/x/publish/route.ts", "utf8");
const publishRules = readFileSync("lib/x/publish.ts", "utf8");
check("publishing still requires the exact approved text", publishRoute.includes("validatePublishRequest") && publishRules.includes("The post needs an explicit final confirmation.") && publishRules.includes("input.confirm !== true"));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("research phase 2 checks passed");
}

main();
