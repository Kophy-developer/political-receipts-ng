import { readFileSync } from "node:fs";
import {
  defaultEngagement,
  engagementMiss,
  engagementQueryLimit,
  parseEngagement,
  withEngagement,
} from "../lib/intel/engagement";
import { financeDiscovery, manchesterDiscovery, politicsDiscovery, preservedPoliticsQuery } from "../lib/pillars/catalog";
import { postsFromSearchBody, recentSearchParams, tweetFields } from "../lib/x/parse";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const catalogs = [
  ["politics", politicsDiscovery.queries],
  ["finance", financeDiscovery.queries],
  ["manchester_united", manchesterDiscovery.queries],
] as const;

for (const [pillar, queries] of catalogs) {
  for (const item of queries) {
    const built = withEngagement(item.query, defaultEngagement);
    const operatorCount = built.ok ? (built.query.match(/\bmin_(?:replies|likes|reposts):\d+\b/g) ?? []).length : 0;
    check(`${pillar} ${item.slug} sends min_replies:20`, built.ok && built.query === `${item.query} min_replies:20` && built.operator === "min_replies:20");
    check(`${pillar} ${item.slug} keeps one operator`, operatorCount === 1);
    check(`${pillar} ${item.slug} keeps the exclusion`, built.ok && built.query.includes("-is:retweet"));
    check(`${pillar} ${item.slug} stays inside the X limit`, built.ok && built.query.length <= engagementQueryLimit);
    check(`${pillar} ${item.slug} keeps its topic words`, item.terms.every((term) => built.ok && built.query.toLowerCase().includes(term)));
    const likes = withEngagement(item.query, { metric: "likes", minimum: 40 });
    const reposts = withEngagement(item.query, { metric: "reposts", minimum: 8 });
    check(`${pillar} ${item.slug} can ask for likes`, likes.ok && likes.query.endsWith("min_likes:40") && !likes.query.includes("min_replies"));
    check(`${pillar} ${item.slug} can ask for reposts`, reposts.ok && reposts.query.endsWith("min_reposts:8") && !reposts.query.includes("min_likes"));
  }
}

check("politics query text is unchanged in the catalog", politicsDiscovery.queries[0]?.query === preservedPoliticsQuery && !preservedPoliticsQuery.includes("min_"));

const repeated = withEngagement(preservedPoliticsQuery, defaultEngagement);
const again = repeated.ok ? withEngagement(repeated.query, defaultEngagement) : repeated;
check("a repeated scan keeps the same operator once", repeated.ok && again.ok && again.query === repeated.query && (again.query.match(/min_replies:20/g) ?? []).length === 1);

const swapped = withEngagement(`${preservedPoliticsQuery} min_likes:5`, { metric: "reposts", minimum: 12 });
check("a repeated scan replaces the previous operator", swapped.ok && swapped.query.endsWith("min_reposts:12") && !swapped.query.includes("min_likes"));

const webSpellings = `${preservedPoliticsQuery} min_faves:10 min_retweets:3`;
const cleaned = withEngagement(webSpellings, defaultEngagement);
check("web-search spellings are not sent", cleaned.ok && !/min_faves|min_retweets/.test(cleaned.query) && cleaned.query.endsWith("min_replies:20"));
check("the stored topic query is not rewritten", webSpellings.includes("min_faves:10") && preservedPoliticsQuery.endsWith("-is:retweet"));

const language = withEngagement('lang:en (INEC OR Nigeria) -is:reply -is:retweet', defaultEngagement);
check("language and exclusion rules stay in the query", language.ok && language.query.startsWith("lang:en") && language.query.includes("-is:reply") && language.query.includes("-is:retweet"));

const invalid = [
  { metric: "faves", minimum: 20 },
  { metric: "retweets", minimum: 20 },
  { metric: "min_faves", minimum: 20 },
  { metric: "min_retweets", minimum: 10 },
  { metric: "replies", minimum: 0 },
  { metric: "replies", minimum: -4 },
  { metric: "likes", minimum: 20.5 },
  { metric: "reposts", minimum: "20abc" },
  { metric: "replies", minimum: 1_000_001 },
  { metric: "", minimum: 20 },
  { metric: "shares", minimum: 20 },
];
for (const input of invalid) {
  const parsed = parseEngagement(input);
  check(`invalid ${JSON.stringify(input)} is refused`, !parsed.ok);
}
const faves = withEngagement("Nigeria -is:retweet", { metric: "faves" as "replies", minimum: 20 });
const zero = withEngagement("Nigeria -is:retweet", { metric: "replies", minimum: 0 });
check("a web-search metric builds no X query", !faves.ok && !("query" in faves));
check("a zero minimum builds no X query", !zero.ok);

const tooLong = withEngagement(`${"budget ".repeat(90)}-is:retweet`, defaultEngagement);
check("an over-long completed query is refused", !tooLong.ok && tooLong.ok === false && tooLong.message.includes("too long"));
check("a blank topic is refused", !withEngagement("   min_replies:20", defaultEngagement).ok);

const politics = withEngagement(preservedPoliticsQuery, defaultEngagement);
const finance = withEngagement(financeDiscovery.queries[0].query, { metric: "likes", minimum: 25 });
const united = withEngagement(manchesterDiscovery.queries[0].query, { metric: "reposts", minimum: 6 });
for (const [name, built] of [["politics", politics], ["finance", finance], ["manchester_united", united]] as const) {
  if (!built.ok) {
    check(`${name} outgoing request`, false);
    continue;
  }
  const params = recentSearchParams({ query: built.query, maxResults: 10, startTime: "2026-11-07T12:00:00.000Z" });
  check(`${name} outgoing query is the completed string`, params.query === built.query && params.max_results === "10" && params["tweet.fields"] === tweetFields);
  check(`${name} outgoing query has its operator`, params.query.includes(built.operator) && !/min_faves|min_retweets/.test(params.query));
}

const low = postsFromSearchBody({
  data: [{
    id: "2119000000000000001",
    text: "A post X would already have excluded at this threshold.",
    author_id: "9",
    public_metrics: { reply_count: 0, like_count: 1, retweet_count: 0 },
  }],
});
check("the parser does not drop a post after X returns it", low.length === 1 && low[0]?.metrics.replies === 0 && low[0]?.metrics.likes === 1);

const run = readFileSync(new URL("../lib/intel/run.ts", import.meta.url), "utf8");
const searchSource = readFileSync(new URL("../lib/x/search.ts", import.meta.url), "utf8");
const discover = readFileSync(new URL("../components/desk/discover.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/desk/engagement/route.ts", import.meta.url), "utf8");
const emptyAt = run.indexOf("if (searched.posts.length === 0)");
const extractAt = run.indexOf("await extractFromPosts(");
const fileAt = run.indexOf("await fileDiscussions(");
const searchRecentBody = searchSource.slice(searchSource.indexOf("export async function searchRecent"), searchSource.indexOf("export async function lookupPosts"));
check("an empty X page stops before extraction", emptyAt > 0 && emptyAt < extractAt && emptyAt < fileAt && run.includes("error: engagementMiss"));
check("the scan sends the completed query once", (run.match(/searchRecent\(/g) ?? []).length === 1 && run.includes("query: gated.requestQuery"));
check("the scan source never uses web-search spellings", !run.includes("min_faves") && !run.includes("min_retweets") && !searchSource.includes("min_faves") && !searchSource.includes("min_retweets"));
check("search passes the query through", searchRecentBody.includes("query: input.query") && searchRecentBody.includes("recentSearchParams(") && !searchRecentBody.includes(".filter("));
check("Discover shows the completed query and the read cost", discover.includes("Query sent to X") && discover.includes("Expected post reads") && discover.includes("Save threshold") && discover.includes("min_replies") && !discover.includes("min_faves") && !discover.includes("min_retweets"));
check("saving a threshold does not call X", !/searchRecent|xUserGet|api\.twitter\.com/.test(route));
check("the empty result sentence is exact", engagementMiss === "No posts met your engagement requirement");

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("engagement checks passed");
