import { readFileSync } from "node:fs";
import { characterCount } from "../lib/format";
import {
  appendSourcePost,
  DRAFT_PROMPT_VERSION,
  DRAFT_UNAVAILABLE,
  draftPrompt,
  draftSchema,
  judgeEditorText,
  judgeModelDrafts,
  judgeSavedText,
  nextVoiceNote,
  savedDraftFields,
  tooSimilar,
  type DraftBrief,
} from "../lib/drafts/rules";
import { requestDraftSet, requestOneStyle } from "../lib/drafts/run";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const brief: DraftBrief = {
  claim: "An X post says INEC created 453 polling units for AI-created registered voters.",
  postText: "INEC secretly created 453 new Polling Unity where the AI created registered voters will now vote.",
  verdict: "NEEDS CONTEXT",
  confidence: "Moderate",
  angleTitle: "The real story is already serious",
  anglePoints: [
    "Suspected AI-generated photographs appearing in a preliminary voter register is serious enough to investigate.",
    "There is no need to attach an unsupported 453-polling-unit claim to make the story concerning.",
  ],
  take: null,
  evidence: [
    { kind: "primary record", label: "INEC polling-unit page", note: "The page does not record 453 new units.", url: "https://inecnigeria.org/polling-units" },
    { kind: "independent reporting", label: "BBC News Pidgin", note: "INEC explains suspected AI-generated images in the preliminary register.", url: "https://www.bbc.com/pidgin/articles/c6gelpr1qq29o" },
    { kind: "independent reporting", label: "Daily Trust", note: "INEC responded. The online preliminary register is not the final certified copy.", url: "https://dailytrust.com/example" },
    { kind: "original allegation", label: "@ClassicEchelon", note: "The post alleges 453 polling units for AI-created voters.", url: "https://x.com/ClassicEchelon/status/2117896758088941615" },
  ],
};

const conversational = "I went looking for the 453 polling units. Credible reporting describes suspected AI-generated photographs in the preliminary voter register, and INEC responded. We could not establish that claim. The photo problem is already serious enough.";
const punchy = "This story is already serious enough. Suspected AI photographs showed up in the preliminary voter register. INEC responded. The 453 polling units? We could not establish that from the evidence reviewed.";
const analytical = "Here's the part that bothers me. Suspected AI-generated photographs in a preliminary voter register are a real problem, and INEC responded. I still cannot tie that to 453 new polling units. The records we reviewed do not establish it.";
const opening = "I went looking for 453 polling units created for AI-generated voters.";
const followA = "Credible reporting describes suspected AI-generated photographs in the preliminary voter register. INEC responded to the irregularities.";
const followB = "That is separate from 453 polling units. We could not establish that claim. The photograph problem does not need the extra number to matter.";

for (const [name, text] of [
  ["conversational", conversational],
  ["punchy", punchy],
  ["analytical", analytical],
  ["opening", opening],
  ["followA", followA],
  ["followB", followB],
] as const) {
  check(`${name} fits one post (${characterCount(text)})`, characterCount(text) <= 280 && characterCount(text) >= 40);
}

const payload = {
  conversational: { text: conversational, hashtag: "#CheckAm" },
  punchy: { text: punchy, hashtag: "#CheckAm" },
  analytical: { text: analytical, hashtag: "#CheckAm" },
  thread: { opening, posts: [followA, followB], hashtag: "#CheckAm" },
};

const judged = judgeModelDrafts(payload);
check("four styles survive", judged.drafts.length === 4);
check("styles are not paraphrases", judged.problems.every((item) => !/repeated/.test(item.reason)));
check("only one version carries #CheckAm", judged.drafts.filter((draft) => draft.hashtag === "#CheckAm").length === 1);
check("no version carries #NotTrue", judged.drafts.every((draft) => !draft.text.includes("#NotTrue")));
check("thread has three posts", judged.drafts.find((draft) => draft.style === "thread")?.parts.length === 3);

const copied = judgeModelDrafts({ ...payload, punchy: { text: conversational, hashtag: "" } });
check("a paraphrase is not saved", copied.drafts.every((draft) => draft.style !== "punchy"));
check("the paraphrase is explained", copied.problems.some((item) => item.style === "punchy" && /repeated/.test(item.reason)));

function blocked(text: string) {
  return judgeModelDrafts({ conversational: { text, hashtag: "" }, punchy: { text: punchy }, analytical: { text: analytical }, thread: payload.thread }).problems.some(
    (item) => item.style === "conversational",
  );
}

check("453 is false is blocked", blocked("The 453 is false. INEC responded to photographs in the voter register, and that is already serious."));
check("never created is blocked", blocked("INEC never created 453 polling units. Photographs in the voter register are a separate problem, and INEC responded."));
check("lied is blocked", blocked("The account lied about 453 polling units. INEC responded to AI photographs in the preliminary voter register."));
check("voted is blocked", blocked("AI-generated voters definitely voted at 453 polling units. INEC responded to photographs in the preliminary voter register."));
check("final register is blocked", blocked("The final certified register contained those AI photographs. INEC responded, and we could not establish the 453 polling units."));
check("institutional opening is blocked", blocked("Our investigation found suspected AI photographs in the preliminary voter register. INEC responded. We could not establish the 453 claim."));
check("fact-check opening is blocked", blocked("Fact check: suspected AI photographs are in the preliminary voter register. INEC responded. We could not establish the 453 claim."));
check("#NotTrue is blocked", blocked(`${conversational}\n\n#NotTrue`));

const prompt = draftPrompt(brief);
check("prompt carries the angle", prompt.user.includes("The real story is already serious"));
check("prompt leaves My take blank", prompt.user.includes("left My take blank"));
check("prompt forbids calling 453 false", prompt.system.includes("453 is false"));
check("prompt forbids #NotTrue", prompt.system.includes("#NotTrue"));
check("prompt recommends #CheckAm", prompt.system.includes("#CheckAm"));
check("prompt asks for four approaches", prompt.user.includes("Conversational") && prompt.user.includes("Punchy") && prompt.user.includes("Analytical") && prompt.user.includes("Thread"));
check("prompt leads with the angle", prompt.system.includes("selected angle") && prompt.user.startsWith("Selected angle:"));
check("prompt refuses a bibliography and a register total", prompt.system.includes("bibliography") && prompt.system.includes("176,846") && prompt.system.includes("Do not put URLs"));
check("prompt allows two posts and a declined thread", prompt.system.includes("blank line") && prompt.system.includes("thread.needed to false"));
check("prompt version moved to draft-v2", prompt.promptVersion === DRAFT_PROMPT_VERSION && DRAFT_PROMPT_VERSION === "draft-v2");
const fullSchema = draftSchema();
check("full schema does not require a thread", "required" in fullSchema && !fullSchema.required.includes("thread"));

const twoPost = judgeModelDrafts({
  ...payload,
  conversational: { text: `${conversational}\n\nI went looking for the 453 figure and could not establish it. The photographs already make the story serious, and INEC responded.`, hashtag: "" },
});
check("conversational can be two posts", twoPost.drafts.find((draft) => draft.style === "conversational")?.parts.length === 2);

const declined = judgeModelDrafts({ ...payload, thread: { needed: false, reason: "The point fits without a sequence." } });
check("THREAD_NOT_NEEDED keeps the other styles", declined.drafts.length === 3 && declined.problems.some((item) => item.style === "thread" && item.reason.startsWith("THREAD_NOT_NEEDED. The point fits without a sequence.")));

const stub = judgeModelDrafts({ ...payload, thread: { opening, posts: ["Too short."] } });
check("a stub thread is not relabeled as unnecessary", stub.problems.some((item) => item.style === "thread" && item.reason.startsWith("A thread post is under 40 characters.")) && stub.problems.every((item) => !item.reason.startsWith("THREAD_NOT_NEEDED")));

check("a register total is not allowed to close the 453 question", blocked("INEC has 176,846 polling units, no extra 453. Suspected AI photographs were reported in the preliminary voter register, and INEC responded."));
check("punchy stays one post", judgeModelDrafts({ ...payload, punchy: { posts: [punchy, punchy] } }).problems.some((item) => item.style === "punchy" && item.reason === "Punchy stays one post."));

const sourced = appendSourcePost(conversational, "https://www.bbc.com/pidgin/articles/c6gelpr1qq29o");
const sourcedDraft = sourced.ok ? judgeSavedText("conversational", sourced.text, false) : null;
check("an editor can attach one source as a follow-up", sourced.ok === true && sourcedDraft?.ok === true && sourcedDraft.draft.parts.length === 2 && sourcedDraft.draft.parts[1]?.startsWith("https://"));
check("a loose source note is refused", appendSourcePost(conversational, "BBC and Daily Trust").ok === false);

const voice = nextVoiceNote({
  existingVoice: null,
  existingText: conversational,
  existingProvider: "groq",
  existingModel: "openai/gpt-oss-20b",
  style: "conversational",
  finalText: "The photographs were the story. I could not establish the 453 figure, and INEC had already responded.",
  angle: "The real story is already serious",
  verdict: "NEEDS CONTEXT",
  editedAt: "2026-11-04T20:10:00.000Z",
});
const revised = voice
  ? nextVoiceNote({
      existingVoice: voice,
      existingText: voice.finalText,
      existingProvider: "groq",
      existingModel: "openai/gpt-oss-20b",
      style: "conversational",
      finalText: "Second edit. The 453 figure still is not established, and INEC responded to the photographs.",
      angle: "A different angle",
      verdict: "VERIFIED",
      editedAt: "2026-11-04T20:20:00.000Z",
    })
  : null;
check("an edit keeps the original Groq draft", voice?.originalText === conversational && voice.provider === "groq" && voice.model === "openai/gpt-oss-20b" && voice.angle === "The real story is already serious" && voice.verdict === "NEEDS CONTEXT");
check("a later edit does not replace the original", revised?.originalText === conversational && revised.finalText.startsWith("Second edit") && revised.angle === "The real story is already serious" && revised.editedAt === "2026-11-04T20:20:00.000Z");

async function main() {
let calls = 0;
const skipped = await requestDraftSet({
  allowance: 0,
  brief,
  model: async () => {
    calls += 1;
    return { ok: true, called: true, data: payload };
  },
});
check("no allowance does not call Gemini", calls === 0 && skipped.unavailable && skipped.message === DRAFT_UNAVAILABLE);

calls = 0;
const timedOut = await requestDraftSet({
  allowance: 1,
  brief,
  model: async () => {
    calls += 1;
    throw new Error("timeout");
  },
});
check("a timeout is one attempt and unavailable", calls === 1 && timedOut.unavailable && timedOut.called && timedOut.message === DRAFT_UNAVAILABLE && timedOut.drafts.length === 0);

calls = 0;
const unconfigured = await requestDraftSet({
  allowance: 1,
  brief,
  model: async () => {
    calls += 1;
    return { ok: false, called: false, message: "Gemini is not configured." };
  },
});
check("an unconfigured model is not treated as a draft", calls === 1 && unconfigured.unavailable && unconfigured.called === false && unconfigured.drafts.length === 0);

calls = 0;
const created = await requestDraftSet({
  allowance: 1,
  brief,
  model: async () => {
    calls += 1;
    return { ok: true, called: true, data: payload };
  },
});
check("one click makes one request", calls === 1 && created.drafts.length === 4 && created.unavailable === false);

calls = 0;
const regenerated = await requestOneStyle({
  allowance: 1,
  brief,
  style: "punchy",
  hashtagAlreadyUsed: true,
  model: async () => {
    calls += 1;
    return { ok: true, called: true, data: { text: punchy, hashtag: "#CheckAm" } };
  },
});
check("regenerate is one request and one style", calls === 1 && regenerated.drafts.length === 1 && regenerated.drafts[0]?.style === "punchy" && regenerated.drafts[0]?.hashtag === null);

const manual = judgeEditorText("I kept looking. The photographs in the preliminary voter register are the serious part, and INEC responded. The 453 polling units are not established by what we reviewed.", false);
check("manual draft does not need a model", manual.ok === true && manual.draft.style === "manual");
check("a manual draft can omit the hashtag", manual.ok === true && manual.draft.hashtag === null);

const tagged = judgeEditorText(`${punchy}\n\n#CheckAm`, false);
check("editor can choose #CheckAm", tagged.ok === true && tagged.draft.hashtag === "#CheckAm");
const notTrue = judgeEditorText(`${punchy}\n\n#NotTrue`, false);
check("editor cannot save #NotTrue", notTrue.ok === false);

const fields = savedDraftFields(created.drafts[0]!, { provider: "gemini", model: "test", editorModified: false });
check("saved draft stays a draft", fields.status === "draft");
check("saved draft has no publish field", !("published_at" in fields) && !("x_post_id" in fields) && fields.generation_metadata.holdReason.includes("Publishing is a separate"));

const route = readFileSync(new URL("../app/api/desk/drafts/generate/route.ts", import.meta.url), "utf8");
check("draft route does not call X, Tavily, or Brave", !/tavily|brave|\/api\/x\/publish|search_recent/i.test(route));

check("distinct fixture texts are actually distinct", !tooSimilar(conversational, punchy) && !tooSimilar(punchy, analytical) && !tooSimilar(conversational, `${opening}\n\n${followA}\n\n${followB}`));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("draft checks passed");
}

main();
