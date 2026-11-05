import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { characterCount, POST_LIMIT } from "../lib/format";
import { defaultEditorName } from "../lib/identity";
import { capabilityForSubscription, longFormEntitlements, textFits } from "../lib/publish/capability";
import { openingFormat, publishPlan, splitForThread } from "../lib/publish/format";
import { postCreateBody } from "../lib/publish/payload";
import { POLLING_UNIT_CLAIM_ID } from "../lib/research/editor-review";
import {
  evidenceBrief,
  finalPostRecord,
  nextAction,
  previewPosts,
  publishablePost,
  readFinalPost,
  reviewComplete,
  storyStage,
} from "../lib/desk/story";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const candidate = `The funny thing is, the real story is already serious enough.
There are credible reports of suspected AI-generated photos appearing on
INEC's preliminary voter register, and INEC itself responded to it.
But this claim that 453 polling units were created for AI-generated voters?
I went looking for the source and couldn't find it.
We really don't need to add unverified claims to an already serious issue.
#CheckAm`;

const facts = {
  hasConversation: true,
  acceptedEvidence: 3,
  verdictRecorded: true,
  angleChosen: true,
  finalText: "",
};
check("the 453 story opens at write", storyStage(facts) === "write" && nextAction(facts) === "WRITE POST");
check("the claim id is the existing story", POLLING_UNIT_CLAIM_ID === "82eaadd5-423c-470c-97e8-04138598b727");

const saved = finalPostRecord(candidate, ["https://www.bbc.com/pidgin/articles/c6gelpr1qq29o", "https://dailytrust.com/example"]);
const loaded = readFinalPost(saved);
check("a saved hashtag is the same text after refresh", loaded.text === candidate && loaded.text.endsWith("#CheckAm"));
check("sources stay out of the final post", !loaded.text.includes("https://") && loaded.sources.length === 2);
check("the record does not rebuild the hashtag separately", saved.suggested_hashtag === null && saved.content.includes("#CheckAm"));
const legacy = readFinalPost({
  content: `${candidate.replace("#CheckAm", "").trim()}\n\nhttps://www.bbc.com/pidgin/articles/c6gelpr1qq29o`,
  generation_metadata: { source: "editor-draft" },
});
check("an earlier normalized save is not treated as the final post", legacy.exact === false && legacy.text === "" && legacy.sources.length === 0);

const preview = previewPosts(candidate);
check("the candidate preview keeps the hashtag and does not cut the post", preview.posts.length === 1 && preview.posts[0] === candidate.trimEnd() && preview.posts[0]?.includes("#CheckAm"));
check("a long post is marked, not shortened", previewPosts(`${"word ".repeat(80)}#CheckAm`).overflow === true);

const longSentence = `${"word ".repeat(70)}end`;
const uncut = splitForThread(longSentence);
check("a sentence over the limit is not cut in half", uncut.posts.length === 1 && uncut.posts[0] === longSentence && characterCount(uncut.posts[0]!) > POST_LIMIT);

const candidateSplit = splitForThread(candidate);
const candidateSentences = candidate.replace(/\s*\n\s*/g, " ").split(/(?<=[.!?])\s+(?=[A-Z#“"])/).map((part) => part.trim());
check(
  "the candidate splits on sentences and keeps the hashtag",
  candidateSplit.posts.some((post) => post.endsWith("#CheckAm"))
    && candidateSplit.posts.every((post) => characterCount(post) <= POST_LIMIT)
    && candidateSentences.every((sentence) => candidateSplit.posts.filter((post) => post.includes(sentence)).length === 1),
);
const overLimit = "A".repeat(281);
const unset = publishPlan({ text: overLimit, format: "unset" });
check("281 characters on an unchecked account is not sent", characterCount(overLimit) === 281 && unset.send === false && /not shortened/.test(unset.reason ?? ""));
const threadPlan = publishPlan({ text: candidate, format: "thread", posts: candidateSplit.posts });
check("a thread is shown in full and is not sent", threadPlan.send === false && threadPlan.label.startsWith("Thread (") && threadPlan.posts.length > 1 && /Automatic thread publishing: Not enabled/.test(threadPlan.reason ?? ""));

const checked = "2026-11-05T06:00:00.000Z";
const none = capabilityForSubscription({ subscription: "None", checkedAt: checked });
const basic = capabilityForSubscription({ subscription: "Basic", checkedAt: checked });
const premium = capabilityForSubscription({ subscription: "Premium", checkedAt: checked });
const plus = capabilityForSubscription({ subscription: "PremiumPlus", checkedAt: checked });
const unknown = capabilityForSubscription({ subscription: null, checkedAt: null });
check("subscription None stays at 280", none.maximum === 280 && none.longForm === false);
check("subscription Basic can send a long post", basic.longForm && basic.maximum === 25_000);
check("subscription Premium can send a long post", premium.longForm && premium.maximum === 25_000);
check("subscription PremiumPlus can send a long post", plus.longForm && plus.maximum === 25_000);
check("an unchecked subscription stays at 280", unknown.maximum === 280 && unknown.longForm === false && unknown.checked === false);
check("long-form entitlements stay in one list", longFormEntitlements.join(",") === "Basic,Premium,PremiumPlus");

const ending = "\n#CheckAm";
const longPost = `${"A".repeat(417 - ending.length)}${ending}`;
check("the 417-character fixture keeps its hashtag", characterCount(longPost) === 417 && longPost.endsWith("#CheckAm"));
const premiumPlan = publishPlan({ text: longPost, format: openingFormat(longPost, premium), capability: premium });
check("a 417-character post on Premium is a long post", premiumPlan.send && premiumPlan.label === "Long post" && premiumPlan.posts[0] === longPost);
const nonePlan = publishPlan({ text: longPost, format: "long", capability: none });
check("a 417-character post on None is blocked", nonePlan.send === false && textFits(longPost, none).ok === false);
check("25001 characters are blocked", textFits("B".repeat(25_001), premium).ok === false);
const body = postCreateBody(longPost);
check("the approved text is the create-post text", body.text === longPost && JSON.parse(JSON.stringify(body)).text === longPost && !("sources" in body));

const gate = publishablePost(candidate);
check("an over-long final post is not shortened", gate.ok === false && /not shortened/.test(gate.reason));
const onePost = "The photographs were the story, and INEC responded. I could not establish the 453 figure.\n\n#CheckAm";
const oneGate = publishablePost(onePost.replace("\n\n#CheckAm", " #CheckAm"));
check("a single post approval is the exact text", oneGate.ok === true && oneGate.text.endsWith("#CheckAm"));
check("two posts are not sent as one shortened post", publishablePost(`First post about the photographs and INEC.\n\nSecond post about the 453 figure. #CheckAm`).ok === false);

const brief = evidenceBrief([
  { review: "accepted", tier: "Established News Organization" },
  { review: "accepted", tier: "Established News Organization" },
  { review: "accepted", tier: "Primary Government Source" },
  { review: "proposed", tier: "Other Source" },
]);
check("review names the accepted reports", brief.independent === 2 && brief.primary === 1 && brief.line.includes("plus"));
const recorded = evidenceBrief(
  [
    { review: "proposed", tier: "Other Source" },
    { review: "proposed", tier: "Other Source" },
  ],
  [
    { kind: "primary record" },
    { kind: "primary record" },
    { kind: "independent reporting" },
    { kind: "independent reporting" },
    { kind: "original allegation" },
  ],
);
check("a recorded verdict counts its reports", recorded.independent === 2 && recorded.primary === 2 && recorded.line === "2 accepted independent reports plus 2 accepted primary records");
check("review waits for every box", reviewComplete({ wording: true, unsupported: true, links: true, exact: false }) === false);
check("review can be completed", reviewComplete({ wording: true, unsupported: true, links: true, exact: true }));

const route = readFileSync(new URL("../app/api/desk/final/route.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/desk/workspace.tsx", import.meta.url), "utf8");
check("saving the final post does not call a provider", !/groq|openrouter|tavily|brave|api\.twitter|generativelanguage/i.test(route));
check("the workspace shows the exact text before send", workspace.includes("Exact text") && workspace.includes("Post this exact text"));
check("use this copies into the final post and does not save over the suggestion", workspace.includes("takeSuggestion(suggestion.text)") && !workspace.includes("suggestion.text ="));
const settings = readFileSync(new URL("../components/settings/x-desk.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../lib/x/account.ts", import.meta.url), "utf8");
check("the format choice sits with the editor", workspace.includes("Post format") && workspace.includes("Long post") && workspace.includes("Automatic thread publishing: Not enabled") && !workspace.includes("Convert to 2 posts"));
check("the desk does not promise a second post will be dropped after send", !workspace.includes("is not sent."));
check("refresh is the explicit profile action", settings.includes("Refresh X account") && !settings.includes("useEffect") && account.includes("subscription_type") && account.includes("profileUrl") && account.includes("identityUrl"));
check("the editor name defaults to PRNG Admin", defaultEditorName === "PRNG Admin");

function sourceOf(dir: string): string {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === "node_modules" || entry === ".next") return [];
    const info = statSync(path);
    if (info.isDirectory()) return [sourceOf(path)];
    if (/\.(ts|tsx|md)$/.test(entry)) return [readFileSync(path, "utf8")];
    return [];
  }).join("\n");
}
const root = new URL("..", import.meta.url);
const product = ["app", "components", "lib"].map((dir) => sourceOf(join(root.pathname, dir))).join("\n");
check("the retired editor name is not in the product", !product.includes("Ifeoma Okeke") && !product.includes("Duty editor"));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("desk checks passed");
