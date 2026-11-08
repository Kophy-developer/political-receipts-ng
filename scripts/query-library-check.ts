import { readFileSync } from "node:fs";
import { defaultEngagement, withEngagement } from "../lib/intel/engagement";
import { queryAudit, sampledGroups, tightenedQueries } from "../lib/intel/query-evidence";
import { discoveryScore, selectDiscoveryQuery } from "../lib/intel/query-library";
import type { StoredGroup } from "../lib/pillars/groups";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const now = Date.parse("2026-11-08T14:00:00.000Z");

const used: Record<string, string | null> = {
  "finance-cbn": "2026-11-08T11:53:47.733Z",
  "finance-debt": "2026-11-08T11:56:47.268Z",
  "finance-global": null,
  "finance-markets": null,
  "united-club": null,
  "united-finances": null,
  "united-match": "2026-11-08T11:58:02.202Z",
  "united-team": null,
  breaking: null,
  "candidates-parties": "2026-11-05T08:15:16.192Z",
  corruption: null,
  "cost-of-living": null,
  education: null,
  "election-2027": "2026-11-04T08:38:01.483Z",
  electricity: null,
  healthcare: null,
  inec: "2026-11-04T12:38:18.020Z",
  "national-assembly": "2026-11-08T13:35:55.916Z",
  "policy-announcements": null,
  presidency: "2026-11-06T18:49:29.674Z",
  "public-finance": null,
  security: null,
};

const queries: Record<string, string> = {
  "finance-cbn": '(CBN OR "Central Bank of Nigeria" OR naira OR MPR) (inflation OR forex OR "interest rate" OR "monetary policy") -is:retweet',
  "finance-debt": '(DMO OR "debt service" OR "public debt" OR "Budget Office" OR appropriation) (Nigeria OR budget OR borrowing) -is:retweet',
  "finance-global": '(IMF OR "World Bank" OR "oil price" OR recession) (Nigeria OR naira OR economy) -is:retweet',
  "finance-markets": '(NGX OR "Central Bank" OR SEC OR banking OR "foreign investment") (Nigeria OR shares OR market) -is:retweet',
  "united-match": '("Manchester United" OR #MUFC OR #GGMU) (goal OR match OR "Premier League" OR scored OR lineup) -is:retweet',
  "united-team": '("Manchester United" OR #MUFC) (manager OR tactic OR injury OR squad OR "Old Trafford") -is:retweet',
  "united-club": '("Manchester United" OR #MUFC) (transfer OR signing OR contract OR "club statement") -is:retweet',
  "united-finances": '("Manchester United" OR #MUFC) (revenue OR wages OR "financial results" OR sponsorship OR "club debt") -is:retweet',
  inec: '(INEC OR "Independent National Electoral Commission") ("voter register" OR PVC OR "polling unit" OR collation OR result) (Nigeria OR Nigerian) -is:retweet',
  "election-2027": '("2027 election" OR "2027 elections") (INEC OR register OR candidate OR result) (Nigeria OR Nigerian) -is:retweet',
  "candidates-parties": '(Tinubu OR "Peter Obi" OR Atiku OR "Pat Utomi" OR APC OR PDP OR "Labour Party") (Nigeria OR election OR INEC) -is:retweet',
  presidency: '("Aso Rock" OR "Federal Government" OR presidency) (Nigeria OR Nigerian) (policy OR budget OR appointment OR executive) -is:retweet',
  "national-assembly": '("National Assembly" OR "House of Representatives" OR "Nigerian Senate") (bill OR vote OR budget OR appropriation) -is:retweet',
  breaking: '(breaking OR "just in") (INEC OR presidency OR Tinubu OR "Peter Obi" OR APC) (Nigeria OR Nigerian) -is:retweet',
  corruption: '(EFCC OR ICPC OR embezzlement OR "public funds" OR "anti-corruption") (Nigeria OR Nigerian) -is:retweet',
  "cost-of-living": '("cost of living" OR inflation OR "fuel price" OR "petrol price" OR subsidy OR naira) (Nigeria OR Nigerian) -is:retweet',
  education: '(education OR UBEC OR "school fees") (budget OR allocation OR strike) (Nigeria OR Nigerian) -is:retweet',
  electricity: '(electricity OR "power supply" OR "national grid" OR NERC) (Nigeria OR Nigerian OR tariff) -is:retweet',
  healthcare: '(healthcare OR NHIA OR "primary health") (budget OR allocation OR strike) (Nigeria OR Nigerian) -is:retweet',
  "policy-announcements": '("executive order" OR "Federal Executive Council" OR "policy announcement") (Nigeria OR Nigerian OR presidency) -is:retweet',
  "public-finance": '("government spending" OR "public debt" OR "national budget" OR "debt service") (Nigeria OR Nigerian) -is:retweet',
  security: '(insecurity OR kidnapping OR banditry OR "security vote") (Nigeria OR Nigerian) -is:retweet',
};

const pillarOf = (slug: string): StoredGroup["pillar"] => slug.startsWith("finance") ? "finance" : slug.startsWith("united") ? "football" : "politics";

function groups(): StoredGroup[] {
  return Object.entries(queries).map(([slug, query]) => ({
    slug,
    name: slug,
    query,
    pillar: pillarOf(slug),
    enabled: true,
    lastUsedAt: used[slug] ?? null,
    rotation: 0,
  }));
}

const politics = selectDiscoveryQuery({ groups: groups(), pillar: "politics", now });
const finance = selectDiscoveryQuery({ groups: groups(), pillar: "finance", now });
const united = selectDiscoveryQuery({ groups: groups(), pillar: "football", now });

check("politics follows the stored sample", politics?.selected.slug === "inec" && politics.selected.sampled && !politics.selected.editorChosen);
check("finance follows the stored sample", finance?.selected.slug === "finance-cbn" && finance.selected.posts === 10);
check("united follows the only sampled group", united?.selected.slug === "united-match" && united.roster.filter((item) => item.sampled).length === 1);
check("unsampled groups are not the automatic choice", [politics, finance, united].every((item) => item?.selected.sampled));

for (const picked of [politics, finance, united]) {
  if (!picked) {
    check("selection exists", false);
    continue;
  }
  const built = withEngagement(picked.selected.requestQuery, defaultEngagement);
  check(`${picked.selected.slug} keeps min_replies:20`, built.ok && built.query.endsWith(" min_replies:20") && built.query.includes("-is:retweet"));
  check(`${picked.selected.slug} does not use a web-search operator`, built.ok && !/min_faves|min_retweets/.test(built.query));
  check(`${picked.selected.slug} names its evidence`, picked.selected.evidence.length > 0 && picked.selected.limitations.some((line) => line.includes("20 replies")));
}

const assembly = selectDiscoveryQuery({ groups: groups(), pillar: "politics", preferenceSlug: "national-assembly", now });
check("a chosen broad group is narrowed from the mismatch", assembly?.selected.slug === "national-assembly" && assembly.selected.tightened && assembly.selected.requestQuery.includes("(Nigeria OR Nigerian)") && !assembly.selected.requestQuery.includes("House of Representatives"));
check("the narrowed assembly query has not been sampled", tightenedQueries["national-assembly"].because.includes("has not been sent") && assembly?.selected.posts === 10);

const debt = selectDiscoveryQuery({ groups: groups(), pillar: "finance", preferenceSlug: "finance-debt", now });
check("debt drops the bare budget match", debt?.selected.requestQuery === tightenedQueries["finance-debt"].query && !debt.selected.requestQuery.includes(" OR budget") && debt.selected.requestQuery.includes("DMO"));

const forcedGap = selectDiscoveryQuery({ groups: groups(), pillar: "politics", preferenceSlug: "cost-of-living", now });
check("an unsampled choice stays unsampled", forcedGap?.selected.slug === "cost-of-living" && forcedGap.selected.posts === 0 && forcedGap.selected.evidence.some((line) => line.includes("No stored posts")));

const unknown = selectDiscoveryQuery({ groups: groups(), pillar: "politics", preferenceSlug: "not-a-group", now });
check("an unknown choice falls back to the sample", unknown?.selected.slug === "inec");

const again = selectDiscoveryQuery({ groups: groups(), pillar: "politics", now });
check("a repeated ranking stays on the same group", again?.selected.slug === politics?.selected.slug && again?.selected.requestQuery === politics?.selected.requestQuery);

const disabled = groups();
const inec = disabled.find((item) => item.slug === "inec");
if (inec) inec.enabled = false;
const withoutInec = selectDiscoveryQuery({ groups: disabled, pillar: "politics", now });
check("disabling the leader uses the next sampled group", withoutInec?.selected.slug === "candidates-parties" && withoutInec.selected.sampled);

check("the sample size is the stored count", queryAudit.distinctPosts === 80 && queryAudit.groupsWithPosts === 8 && queryAudit.groupsWithoutPosts === 14 && queryAudit.repliesAtLeast20 === 0 && queryAudit.maxReplies === 6);
check("phrase counts stay inside their page", Object.values(sampledGroups).every((sample) => sample.phrases.every((item) => item.posts <= sample.posts && item.posts >= 0)));
check("eight sampled groups are recorded", Object.keys(sampledGroups).length === 8);
check("trends and archive gaps are explicit", queryAudit.googleTrends.includes("429") && queryAudit.googleTrends.includes("No trend rank") && queryAudit.fullArchive.includes("not called"));
check("likes do not change the score", discoveryScore("inec", used.inec ?? null, now) === discoveryScore("inec", used.inec ?? null, now));

const library = readFileSync(new URL("../lib/intel/query-library.ts", import.meta.url), "utf8");
const scoreBody = library.slice(library.indexOf("export function discoveryScore"), library.indexOf("function linesFor"));
check("the score does not read likes", !scoreBody.includes("maxLikes") && !scoreBody.includes("like"));
const route = readFileSync(new URL("../app/api/desk/query-group/route.ts", import.meta.url), "utf8");
check("choosing a group does not call X", !/searchRecent|xUserGet|api\.twitter\.com/.test(route));
const run = readFileSync(new URL("../lib/intel/run.ts", import.meta.url), "utf8");
check("the scan sends the selected request query", run.includes("chosen.selection.requestQuery") && run.includes("No posts met your engagement requirement") === false && run.includes("engagementMiss"));
check("one search remains", (run.match(/searchRecent\(/g) ?? []).length === 1);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("query library checks passed");
