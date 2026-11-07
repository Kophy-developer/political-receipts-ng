import { readFileSync } from "node:fs";
import { advanceDevelopment, initialDevelopment, type DevelopmentPorts } from "../lib/editorial/develop";
import { composeFromAnalysis } from "../lib/editorial/findings";
import { describeSource } from "../lib/editorial/quality";
import { postCreateBody } from "../lib/publish/payload";
import { hashOfPlan, runAlreadyCompleted } from "../lib/research/canonical";
import { chooseDocumentIds, examineSources } from "../lib/research/examine";
import { investigate } from "../lib/research/investigate";
import { describeContinuation, continuationPlan } from "../lib/research/resume";
import { analyzeSeries } from "../lib/research/series";
import { extractDocument } from "../lib/research/extract";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const posts = JSON.parse(readFileSync("scripts/fixtures/understanding-quality-posts.json", "utf8")) as { posts: Array<{ text: string }> };
const pidgin = posts.posts.find((item) => item.text.includes("e tell me say"))?.text ?? "";
const quality = describeSource(pidgin);
const investigation = investigate(pidgin, quality);
const capitalHtml = readFileSync("scripts/fixtures/capital-importation.html", "utf8");
const gapCsv = readFileSync("scripts/fixtures/investment-gap.csv", "utf8");
const oldQuery = "foreign companies invest Nigeria because tinubu economy best";
const house = Array.from({ length: 5 }, (_, index) => ({
  id: `house-${index}`,
  title: "President welcomes foreign investors",
  url: `https://statehouse.gov.ng/investors-${index}`,
  domain: "statehouse.gov.ng",
  snippet: "foreign companies are investing",
  opened: false,
  retrievalStatus: "not_retrieved",
  inDomain: true,
}));
const oldPlan = continuationPlan({ claim: "foreign companies don Dey invest in Nigeria because of tinubu and our economy is the best it has ever been", investigation, providerId: "tavily" });
const storedOld = { ...oldPlan, planner: undefined, domains: ["statehouse.gov.ng", "nigerianstat.gov.ng"], searches: oldPlan.searches.map((item) => ({ ...item, query: oldQuery, domains: ["statehouse.gov.ng"] })) };
storedOld.searches = [{ ...storedOld.searches[0], query: oldQuery }];
const oldHash = hashOfPlan(storedOld, "tavily");
const offer = describeContinuation({
  claim: storedOld.claim,
  investigation,
  sources: house,
  runs: [{ hash: oldHash, status: "completed", operations: 1 }],
  continuations: 0,
  searchCompleted: true,
  searchesUsed: 1,
  retrievalsUsed: 0,
});

check("five State House results do not satisfy a statistical series", chooseDocumentIds(house, investigation, 2).length === 0 && examineSources(investigation, house).stage === "SEARCH_COMPLETED" && examineSources(investigation, house).analysis === null);
check("a recognized FDI question offers the World Bank series and no search", offer.available && offer.structuredId === "world-bank-ng-fdi-net-inflows" && offer.searches === 0 && offer.documents === 0 && offer.openIds.length === 0 && offer.plan === null && /World Bank/i.test(offer.why) && /No new search/i.test(offer.why));
check("the FDI offer stays available when the search budget is exhausted", describeContinuation({ claim: storedOld.claim, investigation, sources: house, runs: [{ hash: oldHash, status: "completed", operations: 1 }], continuations: 2, searchCompleted: true, searchesUsed: 12, retrievalsUsed: 20 }).structuredId === "world-bank-ng-fdi-net-inflows");

const capitalClaim = "What was Nigeria capital importation over the last ten years?";
const capitalInvestigation = investigate(capitalClaim, describeSource(capitalClaim));
const capitalOffer = describeContinuation({
  claim: capitalClaim,
  investigation: capitalInvestigation,
  sources: house,
  runs: [{ hash: oldHash, status: "completed", operations: 1 }],
  continuations: 0,
  searchCompleted: true,
  searchesUsed: 1,
  retrievalsUsed: 0,
});
check("the upgraded plan is a different key from the completed search", capitalOffer.available && capitalOffer.planKey !== oldHash && capitalOffer.plan?.planner === "phase2-statistics" && !capitalOffer.plan.domains.includes("statehouse.gov.ng") && capitalOffer.plan.searches.every((item) => item.query !== oldQuery));
check("an old completed plan still counts as already run", runAlreadyCompleted({ hash: oldHash, provider: "tavily", runs: [{ hash: oldHash, provider: "Tavily", status: "completed", operations: 1 }] }) && capitalOffer.planKey !== null && !runAlreadyCompleted({ hash: capitalOffer.planKey, provider: "tavily", runs: [{ hash: oldHash, provider: "Tavily", status: "completed", operations: 1 }] }));
check("the offer names the question, the gap, and the request counts", /ten years|official statistics|three years|capital importation/i.test(capitalOffer.question) && /State House/i.test(capitalOffer.why) && capitalOffer.searches <= 3 && capitalOffer.documents <= 2 && capitalOffer.searchesRemaining === 11 && capitalOffer.documentsRemaining === 20);

const repeated = describeContinuation({
  claim: capitalClaim,
  investigation: capitalInvestigation,
  sources: house,
  runs: [{ hash: oldHash, status: "completed", operations: 1 }, { hash: capitalOffer.planKey, status: "completed", operations: capitalOffer.searches }],
  continuations: 1,
  searchCompleted: true,
});
const capped = describeContinuation({
  claim: capitalClaim,
  investigation: capitalInvestigation,
  sources: house,
  runs: [{ hash: oldHash, status: "completed", operations: 1 }],
  continuations: 2,
  searchCompleted: true,
});
check("a completed upgraded plan does not run again", repeated.available === false && repeated.blocker === "No relevant source found" && capped.available === false);

const budget = describeContinuation({
  claim: capitalClaim,
  investigation: capitalInvestigation,
  sources: house,
  runs: [{ hash: oldHash, status: "completed", operations: 1 }],
  continuations: 0,
  searchCompleted: true,
  searchesUsed: 12,
  retrievalsUsed: 0,
});
const retrievalCap = describeContinuation({
  claim: capitalClaim,
  investigation: capitalInvestigation,
  sources: house,
  runs: [{ hash: oldHash, status: "completed", operations: 1 }],
  continuations: 0,
  searchCompleted: true,
  searchesUsed: 1,
  retrievalsUsed: 20,
});
const oneLeft = describeContinuation({
  claim: capitalClaim,
  investigation: capitalInvestigation,
  sources: house,
  runs: [{ hash: oldHash, status: "completed", operations: 1 }],
  continuations: 0,
  searchCompleted: true,
  searchesUsed: 11,
  retrievalsUsed: 19,
});
check("search and document requests stay inside the daily caps", budget.available === false && budget.blocker === "Provider or budget failure" && retrievalCap.blocker === "Provider or budget failure" && oneLeft.searches === 1 && oneLeft.documents === 1);

const opened = extractDocument({ html: capitalHtml, url: "https://nigerianstat.gov.ng/capital-importation", title: "Capital importation" });
const analysis = analyzeSeries(opened.observations, "capital importation");
check("an opened table produces the chart and the comparisons", analysis?.chart?.points.length === 10 && analysis.tenYear?.absolute === 400 && analysis.threeYear?.fromYear === 2023);
const gap = analyzeSeries(extractDocument({ csv: gapCsv, text: "National Bureau of Statistics. Capital importation, USD million. Nominal." }).observations, "capital importation");
check("a missing year stays unresolved", gap?.missingYears.includes(2018) === true && gap.tenYear === null && !gap.chart?.points.some((point) => point.year === 2018));
const incompatible = analyzeSeries([
  { series: "Capital importation", year: 2020, value: 100, unit: "USD million", basis: "nominal", sourceName: "National Bureau of Statistics", url: "https://nigerianstat.gov.ng/a" },
  { series: "Capital importation", year: 2021, value: 110, unit: "NGN billion", basis: "nominal", sourceName: "National Bureau of Statistics", url: "https://nigerianstat.gov.ng/a" },
], "capital importation");
check("incompatible units are not compared", incompatible?.comparable === false && incompatible.chart === null);

const draft = analysis ? composeFromAnalysis({ quality, analysis, domain: "nigerianstat.gov.ng" }) : "";
const years = new Set(analysis?.observations.map((item) => String(item.year)));
check("the draft uses only opened figures", /5,400/.test(draft) && /5,000/.test(draft) && !/2015/.test(draft) && !/9,999/.test(draft) && [...draft.matchAll(/\b20\d\d\b/g)].every((match) => years.has(match[0])));

async function main() {
let researchCalls = 0;
const ports: DevelopmentPorts = {
  research: async () => {
    researchCalls += 1;
    return { ok: true, called: true, label: "usable", sources: [], message: "should not run" };
  },
  draft: async () => ({ ok: true, called: false, drafts: [], message: "should not run" }),
};
const stuck = {
  ...initialDevelopment(pidgin),
  completed: ["interpret", "research"] as Array<"interpret" | "research">,
  evidenceStatus: "RELEVANT_EVIDENCE_FOUND" as const,
  searchStatus: "SEARCH_COMPLETED" as const,
  evidence: { label: "insufficient" as const, sources: house.map((item) => ({ title: item.title, url: item.url, domain: item.domain, snippet: item.snippet, opened: false })) },
};
const stopped = await advanceDevelopment(stuck, ports);
check("Develop does not search again after an insufficient completed search", researchCalls === 0 && /Continue research on this story/.test(stopped.unresolved || "") && stopped.ready === false);

const fresh = describeContinuation({ claim: pidgin, investigation, sources: [], runs: [], continuations: 0, searchCompleted: false });
check("a story with no search yet does not advertise Continue research", fresh.available === false);
const published = describeContinuation({ claim: storedOld.claim, investigation, sources: house, runs: [{ hash: oldHash, status: "completed", operations: 1 }], continuations: 0, searchCompleted: true, published: true });
const exact = postCreateBody("The editor approved this sentence.");
check("a published story is unchanged and publishing still sends the exact text", published.available === false && exact.text === "The editor approved this sentence.");

const page = `${readFileSync("app/desk/work/[id]/page.tsx", "utf8")}\n${readFileSync("components/desk/continue-research.tsx", "utf8")}`;
const route = readFileSync("app/api/desk/develop/route.ts", "utf8");
check("the story page shows the next action and Continue research", page.includes("Next action") && page.includes("Continue research") && page.includes("Why the saved results are not enough"));
check("continue research is confirmed on the story and does not publish", route.includes("continue") && !route.includes("publishApprovedPost"));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("research resumption checks passed");
}

main();
