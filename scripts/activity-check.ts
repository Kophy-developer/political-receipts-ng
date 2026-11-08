import { readFileSync } from "node:fs";
import { conversationActivity, lookupCost, type ActivityInput } from "../lib/intel/activity";
import { metricsFromStored, metricsFromX } from "../lib/intel/metrics";
import { postsFromSearchBody, tweetFields } from "../lib/x/parse";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const empty = { replies: null, reposts: null, likes: null, quotes: null, bookmarks: null, views: null };

function post(patch: Partial<ActivityInput> & Pick<ActivityInput, "id" | "text" | "xConversationId">): ActivityInput {
  return {
    authorId: "1",
    username: "account",
    displayName: "Account",
    createdAt: "2026-11-08T11:00:00Z",
    retrievedAt: "2026-11-08T11:53:48Z",
    scanId: "scan-a",
    deskConversationId: "desk-1",
    referenced: [],
    metrics: { ...empty, likes: 0, replies: 0, reposts: 0, quotes: 0 },
    pillar: "finance",
    ...patch,
  };
}

const allowance = { requestsRemaining: 3, postsRemaining: 20, known: true };
const debt = "Debt stock rose from about N87tn in mid-2023 to N166tn by June 2026 after the budget office published the figure.";
const debtAgain = "The budget office figure shows debt stock rose from N87tn in mid-2023 toward N166tn by June 2026.";
const reaction = "United were brilliant today. What a performance from the lads after the final whistle.";

const missingViews = post({
  id: "200",
  text: debt,
  xConversationId: "100",
  createdAt: "2026-11-08T11:10:00Z",
  metrics: { replies: 1, reposts: 0, likes: 50, quotes: 0, bookmarks: null, views: null },
  referenced: [{ type: "replied_to", id: "100" }],
});
const quietReply = post({
  id: "201",
  text: "A short reply in the same thread about the same budget figure and debt stock.",
  xConversationId: "100",
  createdAt: "2026-11-08T11:05:00Z",
  metrics: { replies: 0, reposts: 0, likes: 0, quotes: 0, bookmarks: null, views: 2 },
});
const related = post({
  id: "300",
  text: debtAgain,
  xConversationId: "900",
  deskConversationId: "desk-2",
  createdAt: "2026-11-08T11:20:00Z",
  pillar: "finance",
  metrics: { replies: 0, reposts: 0, likes: 4, quotes: 0, bookmarks: null, views: 12 },
});
const firstCopy = post({
  id: "200",
  text: debt,
  xConversationId: "100",
  scanId: "scan-old",
  retrievedAt: "2026-11-08T10:00:00Z",
  metrics: { replies: 1, reposts: 0, likes: 50, quotes: 0, bookmarks: null, views: 9 },
});

const activity = conversationActivity([firstCopy, missingViews, quietReply, related], { postId: "200", deskConversationId: "desk-1", pillar: "finance" }, allowance);
check("a missing view stays unavailable", activity.exact.concat(activity.original ? [activity.original] : []).find((item) => item.id === "200")?.metrics.find((item) => item.label === "Views")?.value === "Not returned");
check("a stored zero stays zero", activity.exact.find((item) => item.id === "201")?.metrics.find((item) => item.label === "Likes")?.value === "0");
check("bookmarks are not invented", activity.exact.every((item) => item.metrics.find((metric) => metric.label === "Bookmarks")?.value === "Not returned"));
check("the original is absent when the root is not in the scan", activity.originalState === "absent" && activity.absentId === "100" && activity.original === null);
check("the busiest post is not treated as the original", !activity.exact.some((item) => item.membership === "original") && activity.exact[0]?.id === "201");
check("exact membership is the shared conversation id", activity.exact.map((item) => item.id).sort().join(",") === "200,201");
check("a matching subject in another conversation stays related", activity.related.map((item) => item.id).join(",") === "300" && activity.related[0]?.membership === "related");
const sameDesk = conversationActivity([
  post({ id: "200", text: debt, xConversationId: "100" }),
  post({ id: "700", text: "A completely different sentence about a stadium tour.", xConversationId: "888", deskConversationId: "desk-1" }),
], { postId: "200", deskConversationId: "desk-1", pillar: "finance" }, allowance);
check("a desk cluster does not turn a different X conversation into exact membership", sameDesk.exact.every((item) => item.id !== "700") && sameDesk.related.some((item) => item.id === "700"));
check("a repeated scan collapses to the latest collection", activity.collapsedDuplicates === 1 && activity.exact.find((item) => item.id === "200")?.collectedAt === "2026-11-08T11:53:48Z");

const present = conversationActivity([
  post({ id: "100", text: reaction, xConversationId: "100", pillar: "football", metrics: { ...empty, likes: 0, replies: 0, reposts: 0, quotes: 0, views: null }, createdAt: "2026-11-08T11:00:00Z" }),
  post({ id: "400", text: "What a night at the theatre of dreams for the lads.", xConversationId: "100", pillar: "football", metrics: { ...empty, likes: 80, replies: 10, reposts: 2, quotes: 1, views: 1000 }, createdAt: "2026-11-08T12:00:00Z" }),
], { postId: "400", pillar: "football" }, allowance);
check("the original author is the root post, not the most liked reply", present.original?.id === "100" && present.original.metrics.find((item) => item.label === "Likes")?.value === "0" && present.exact[0]?.id === "400");

const politics = conversationActivity([
  post({ id: "500", text: "The electoral act amendment is still before the national assembly this week.", xConversationId: "500", pillar: "politics", metrics: { ...empty, likes: 3, replies: 1, reposts: 0, quotes: 0, views: 20 } }),
], { postId: "500", pillar: "politics" }, allowance);
check("politics uses engagement as context, not persuasion", politics.original?.id === "500" && /not used to optimize a post for an audience/.test(politics.context));
check("finance does not add the persuasion line", /not used to optimize/.test(activity.context) === false);

const blocked = lookupCost({ requestsRemaining: 0, postsRemaining: 20, known: true });
const open = lookupCost(allowance);
const unread = lookupCost({ requestsRemaining: 4, postsRemaining: 40, known: false });
check("a lookup shows one request and stops at the daily ceiling", open.requests === 1 && open.posts === 1 && open.allowed && /1 X request/.test(open.note) && blocked.allowed === false && unread.allowed === false);

const parsed = postsFromSearchBody({
  data: [
    {
      id: "2119386210766311598",
      text: "Debt stock rose from about N87tn.",
      author_id: "99",
      created_at: "2026-11-08T11:07:03.000Z",
      conversation_id: "2119386107230171622",
      referenced_tweets: [{ type: "replied_to", id: "2119386107230171622" }],
      public_metrics: { reply_count: 0, retweet_count: 0, like_count: 0, quote_count: 0 },
      lang: "en",
    },
  ],
  includes: { users: [{ id: "99", username: "grok", name: "Grok" }] },
});
check("a saved response without views or bookmarks does not invent them", parsed[0]?.metrics.views === null && parsed[0]?.metrics.bookmarks === null && parsed[0]?.metrics.likes === 0 && parsed[0]?.conversationId === "2119386107230171622");
check("a returned bookmark is kept", metricsFromX({ reply_count: 1, retweet_count: 2, like_count: 3, quote_count: 4, bookmark_count: 0, impression_count: 8 }).bookmarks === 0 && metricsFromX({ like_count: 3 }).likes === 3 && metricsFromX({ like_count: 3 }).replies === null);
check("stored rows without a bookmarks key stay unavailable", metricsFromStored({ likes: 0, replies: 0, reposts: 0, quotes: 0, views: 2 }).bookmarks === null && metricsFromStored({ likes: 0, views: null }).views === null);
check("the recent search asks for the supported post fields", tweetFields.split(",").sort().join(",") === "author_id,conversation_id,created_at,lang,public_metrics,referenced_tweets");

const search = readFileSync("lib/x/search.ts", "utf8");
const lookup = readFileSync("lib/db/activity.ts", "utf8");
const route = readFileSync("app/api/desk/conversation/route.ts", "utf8");
const panel = readFileSync("components/desk/conversation-activity.tsx", "utf8");
const publish = readFileSync("lib/x/publish.ts", "utf8");
check("search and lookup share the field list", search.includes("tweetFields") && search.includes("lookupPosts") && lookup.includes("confirm !== true") && lookup.indexOf("confirm !== true") < lookup.indexOf("lookupPosts("));
check("lookup does not publish or create an opportunity", !lookup.includes("syncModelOpportunities") && !lookup.includes("publishApprovedPost") && !route.includes("publish"));
check("the editor can open a post and no reply is sent automatically", panel.includes("Open on X") && panel.includes("No reply is sent") && !panel.includes("/api/x/publish") && panel.includes('confirm: true'));
check("exact-text publishing is unchanged", publish.includes("input.confirm !== true"));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("activity checks passed");
