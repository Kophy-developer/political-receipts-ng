import { readFileSync } from "node:fs";
import { characterCount, POST_LIMIT } from "../lib/format";
import { POLLING_UNIT_CLAIM_ID } from "../lib/research/editor-review";
import {
  convertToTwoPosts,
  evidenceBrief,
  finalPostRecord,
  nextAction,
  postsIn,
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

const preview = previewPosts(candidate);
check("the candidate preview keeps the hashtag and does not cut the post", preview.posts.length === 1 && preview.posts[0] === candidate.trimEnd() && preview.posts[0]?.includes("#CheckAm"));
check("a long post is marked, not shortened", previewPosts(`${"word ".repeat(80)}#CheckAm`).overflow === true);

const long = `${"The photographs were already the story. ".repeat(12)}#CheckAm`;
const split = convertToTwoPosts(long);
check("convert to two posts keeps the hashtag and both pieces", Boolean(split) && split!.includes("#CheckAm") && postsIn(split!).length === 2 && postsIn(split!).every((post) => characterCount(post) <= POST_LIMIT));

const gate = publishablePost(candidate);
check("an over-long final post is not shortened", gate.ok === false && /not shortened/.test(gate.reason));
const candidateSplit = convertToTwoPosts(candidate);
check("the candidate can be split without dropping the hashtag", Boolean(candidateSplit) && candidateSplit!.includes("#CheckAm") && postsIn(candidateSplit!).every((post) => characterCount(post) <= POST_LIMIT));
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
check("review waits for every box", reviewComplete({ wording: true, unsupported: true, links: true, exact: false }) === false);
check("review can be completed", reviewComplete({ wording: true, unsupported: true, links: true, exact: true }));

const route = readFileSync(new URL("../app/api/desk/final/route.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/desk/workspace.tsx", import.meta.url), "utf8");
check("saving the final post does not call a provider", !/groq|openrouter|tavily|brave|api\.twitter|generativelanguage/i.test(route));
check("the workspace shows the exact text before send", workspace.includes("Exact text") && workspace.includes("Post this exact text"));
check("use this copies into the final post and does not save over the suggestion", workspace.includes("setText(suggestion.text)") && !workspace.includes("suggestion.text ="));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("desk checks passed");
