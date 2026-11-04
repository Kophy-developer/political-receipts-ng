import { composeStoredPlan, hashOfPlan, runAlreadyCompleted } from "../lib/research/canonical";
import { executeStage } from "../lib/research/execute";
import { selectForRetrieval } from "../lib/research/filter";
import { officialLinks } from "../lib/research/official";
import { evidenceQuality } from "../lib/research/quality";
import { braveSearchQuery, tavilySearchBody } from "../lib/research/search-request";
import type { SourceCategory } from "../lib/research/types";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const politics: SourceCategory[] = [
  { rank: 1, name: "Primary record", notes: "The office that owns the record.", domains: ["inecnigeria.org", "nigerianstat.gov.ng", "cbn.gov.ng", "budgetoffice.gov.ng", "dmo.gov.ng"] },
  { rank: 2, name: "Independent reporting", notes: "Wire services.", domains: ["reuters.com", "apnews.com", "bbc.com", "bbc.co.uk"] },
  { rank: 3, name: "Specialist verification", notes: "Fact-checkers.", domains: ["africacheck.org"] },
  { rank: 4, name: "Context", notes: "Social pages stay here.", domains: [] },
];

const bayode = "Meet Dr. Lawrence Bayode, Director of ICT at INEC. He has been accused of allowing (or overseeing) the insertion of AI-generated photographs into the voter register, raising suspicions of attempts to manipulate the 2027 elections. He was also a key ICT official when INEC claimed";

const plan = composeStoredPlan({
  claim: bayode,
  pillar: "politics",
  claimTypes: ["election rule/process", "public-office record"],
  categories: politics,
  stage: "primary",
  providerId: "tavily",
  cursor: 0,
  maxOperations: 3,
  awaitingReview: false,
});

check("primary domain is INEC only", plan.domains.length === 1 && plan.domains[0] === "inecnigeria.org");
check("authority is INEC", plan.authority === "Independent National Electoral Commission");
check("three separate questions", plan.questions.length === 3);
check("role question", plan.questions.some((item) => item.problem === "record" && /Lawrence Bayode/.test(item.question) && /Director of ICT/.test(item.question)));
check("allegation question", plan.questions.some((item) => item.problem === "allegation" && /voter register/.test(item.question)));
check("attribution question", plan.questions.some((item) => item.problem === "attribution" && item.question === "Who originally made the accusation?"));
check("scheduled searches stay inside the cap", plan.searches.length >= 2 && plan.searches.length <= 3);
check("queries do not smuggle the domain", plan.searches.every((item) => !/inecnigeria\.org|site:/i.test(item.query)));
check("a role query is scheduled", plan.searches.some((item) => item.problem === "record" && /Lawrence Bayode/.test(item.query)));
check("an allegation query is scheduled", plan.searches.some((item) => item.problem === "allegation" && /voter register/.test(item.query)));
check("attribution is not a primary search", plan.searches.every((item) => item.problem !== "attribution"));
check("every search carries the same domains", plan.searches.every((item) => item.domains.join(",") === "inecnigeria.org" && item.stage === "primary"));

const hash = hashOfPlan(plan, "tavily");
check("hash is stable", hash === hashOfPlan(plan, "tavily") && hash.length === 64);
check(
  "identical run is blocked",
  runAlreadyCompleted({ hash, provider: "tavily", runs: [{ hash, provider: "Tavily", status: "completed", operations: 2 }] }),
);
check(
  "a failed empty run does not block",
  runAlreadyCompleted({ hash, provider: "tavily", runs: [{ hash, provider: "Tavily", status: "failed", operations: 0 }] }) === false,
);
check(
  "a different provider is a different operation",
  runAlreadyCompleted({ hash: hashOfPlan(plan, "brave"), provider: "brave", runs: [{ hash, provider: "Tavily", status: "completed", operations: 2 }] }) === false,
);

const rotated = composeStoredPlan({
  claim: bayode,
  pillar: "politics",
  claimTypes: ["election rule/process"],
  categories: politics,
  stage: "primary",
  providerId: "tavily",
  cursor: plan.cursor + plan.searches.length,
  maxOperations: 3,
  awaitingReview: true,
});
check("changing the plan changes the queries", rotated.searches.map((item) => item.query).join("|") !== plan.searches.map((item) => item.query).join("|"));
check("changed plan waits for review", rotated.awaitingReview === true);
check("changed plan has a new hash", hashOfPlan(rotated, "tavily") !== hash);

const stripped = politics.map((category) =>
  category.rank === 1 ? { ...category, domains: category.domains.filter((domain) => domain !== "inecnigeria.org") } : category,
);
const fallback = composeStoredPlan({
  claim: bayode,
  pillar: "politics",
  claimTypes: ["election rule/process"],
  categories: stripped,
  stage: "primary",
  providerId: "tavily",
  cursor: 0,
  maxOperations: 3,
  awaitingReview: false,
});
check("removed hierarchy domain is not invented", fallback.domains.includes("inecnigeria.org") === false);
check("fallback uses the remaining primary tier", fallback.domains.includes("cbn.gov.ng") && fallback.domains.includes("nigerianstat.gov.ng"));

const independent = composeStoredPlan({
  claim: bayode,
  pillar: "politics",
  claimTypes: ["election rule/process"],
  categories: politics,
  stage: "independent",
  providerId: "tavily",
  cursor: 0,
  maxOperations: 3,
  awaitingReview: true,
});
check("independent stage uses the reporting tier", independent.domains.includes("reuters.com") && independent.domains.includes("africacheck.org"));
check("independent stage does not search INEC as its target", independent.domains.includes("inecnigeria.org") === false);

const cpi = composeStoredPlan({
  claim: "The National Bureau of Statistics publishes Nigeria's official Consumer Price Index.",
  pillar: "politics",
  claimTypes: ["economic statistic", "public-office record"],
  categories: politics,
  stage: "primary",
  providerId: "tavily",
  cursor: 0,
  maxOperations: 3,
  awaitingReview: false,
});
check("inflation uses the statistics office", cpi.domains.length === 1 && cpi.domains[0] === "nigerianstat.gov.ng");

const body = tavilySearchBody(plan.searches[0].query, 5, plan.domains);
check("tavily include_domains is explicit", Array.isArray(body.include_domains) && (body.include_domains as string[])[0] === "inecnigeria.org");
check("tavily query stays free of the domain", !String(body.query).includes("inecnigeria.org"));
const brave = braveSearchQuery(plan.searches[0].query, plan.domains);
check("brave uses site filters", brave.includes("site:inecnigeria.org") && !brave.includes("api_key"));

const hits = [
  { url: "https://inecnigeria.org/news/bayode", title: "INEC", description: "Lawrence Bayode", published: null },
  { url: "https://www.facebook.com/channelsforum/videos/1", title: "Facebook", description: "social", published: null },
  { url: "https://randomblog.example/inec-photos", title: "A blog", description: "unrelated", published: null },
  { url: "https://www.youtube.com/watch?v=abc", title: "YouTube", description: "video", published: null },
];
const selected = selectForRetrieval(hits, "primary", ["inecnigeria.org"], 2);
check("only the INEC result is eligible", selected.eligible.length === 1 && selected.eligible[0].url.startsWith("https://inecnigeria.org/"));
check("facebook is rejected", selected.rejected.some((item) => item.url.includes("facebook.com")));
check("blog is rejected", selected.rejected.some((item) => item.url.includes("randomblog.example")));
check("youtube is rejected", selected.rejected.some((item) => item.url.includes("youtube.com")));

async function main() {
const seenQueries: string[] = [];
const run = await executeStage({
  stage: "primary",
  domains: plan.domains,
  categories: politics,
  searches: plan.searches,
  search: async (query) => {
    seenQueries.push(query);
    return { ok: true, hits, credits: 1 };
  },
});
check("execution uses the stored queries", seenQueries.join("|") === plan.searches.map((item) => item.query).join("|"));
check("search does not open a document", run.documentsSelected === 0);
check("every returned hit is kept in the inventory", run.inventory.length === plan.searches.length * hits.length);
check("the INEC hit stays unopened", run.inventory.some((item) => item.url.startsWith("https://inecnigeria.org/") && item.retrievalStatus === "not_retrieved" && item.inDomain));
check("out of scope results are recorded", run.outside.some((item) => item.url.includes("facebook.com")) && run.outside.some((item) => item.url.includes("randomblog.example")));
check("rejected results stay in the inventory", run.inventory.some((item) => item.url.includes("facebook.com") && item.retrievalStatus === "rejected"));

const html = [
  '<a href="https://www.facebook.com/inec">Facebook</a>',
  '<a href="https://randomblog.example/bayode">Blog</a>',
  '<a href="https://inecnigeria.org/news/lawrence-bayode-ict">Lawrence Bayode ICT</a>',
  '<a href="/about">About</a>',
].join("");
const links = officialLinks(html, "https://inecnigeria.org/", ["inecnigeria.org"], ["bayode", "voter", "photograph"], 2);
check("official links stay on the official host", links.length === 1 && links[0] === "https://inecnigeria.org/news/lawrence-bayode-ict");

const missed = await executeStage({
  stage: "primary",
  domains: ["inecnigeria.org"],
  categories: politics,
  searches: [plan.searches[0]],
  search: async () => ({
    ok: true,
    hits: hits.filter((item) => !item.url.includes("inecnigeria.org")),
    credits: null,
  }),
});
check("a miss does not open the official site by itself", missed.documentsSelected === 0 && missed.inventory.every((item) => item.retrievalStatus === "rejected"));
check("social hits stay in the inventory when they are outside the stage", missed.inventory.some((item) => item.url.includes("facebook.com") && item.retrievalStatus === "rejected"));

const units = composeStoredPlan({
  claim: "An X post says INEC created 453 polling units for AI-created registered voters.",
  pillar: "politics",
  claimTypes: ["election rule/process"],
  categories: politics,
  stage: "primary",
  providerId: "tavily",
  cursor: 0,
  maxOperations: 3,
  awaitingReview: false,
});
check("453 plan asks the four factual questions", units.questions.length === 4);
check("453 plan does not research the insult", units.questions.every((item) => !/criminal/i.test(item.question)));
check("453 plan stays on INEC", units.domains.length === 1 && units.domains[0] === "inecnigeria.org" && units.authority === "Independent National Electoral Commission");
check("453 plan schedules three searches", units.searches.length === 3);
check("453 figure is the first search", units.searches[0]?.query === "453 polling units" && units.searches[0]?.problem === "record");
check("453 meaning is searched", units.searches.some((item) => item.query === "453 registration centres wards constituencies"));
check("AI register terms are searched", units.searches.some((item) => item.problem === "allegation" && /artificial intelligence/.test(item.query)));
check("453 direct terms keep the number", units.direct.terms.includes("453"));

const quality = evidenceQuality({
  authority: "Independent National Electoral Commission",
  primaryDomains: ["inecnigeria.org"],
  sources: [
    { domain: "instagram.com", tierRank: 4 },
    { domain: "facebook.com", tierRank: 4 },
  ],
});
check("social pack is context only", quality.label === "CONTEXT ONLY");
check("quality names the missing record", quality.reason === "No INEC record was retrieved. The available sources are social-media pages and cannot establish the factual allegation.");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("research plan checks passed");
}

void main();
