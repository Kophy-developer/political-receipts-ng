import { readFileSync } from "node:fs";
import { developmentDraftPrompt, draftPrompt } from "../lib/drafts/rules";
import { postCreateBody } from "../lib/publish/payload";
import { classifyEvidence } from "../lib/research/relevance";
import {
  advanceDevelopment,
  developmentPreview,
  furtherSearchPreview,
  initialDevelopment,
  type DevelopmentPorts,
  type DevelopmentState,
  type RetrievedSource,
} from "../lib/editorial/develop";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const fixture = JSON.parse(readFileSync("scripts/fixtures/understanding-quality-posts.json", "utf8")) as {
  posts: Array<{ text: string }>;
};
const text = (part: string) => fixture.posts.find((item) => item.text.includes(part))?.text ?? "";
const taxi = text("drove taxis");
const investment = text("e tell me say");
const ringtone = text("ringtone is whirling");
const atiku = text("Sultan");
const prediction = text("no way Tinubu will survive");
const rhetoric = text("unity beggars");
const ambiguous = "Foreign companies are investing in Nigeria because the economy is the best. Foreign companies do not invest in Nigeria.";

function openedFor(kind: string): RetrievedSource {
  if (kind === "investment") {
    return { title: "Foreign companies investing", url: "https://example.edu/investing", domain: "example.edu", opened: true, snippet: "foreign companies investing", text: "The opened page discusses foreign companies investing and does not settle the economy." };
  }
  if (kind === "ringtone") {
    return { title: "The ringtone and the billboards", url: "https://example.edu/ringtone", domain: "example.edu", opened: true, snippet: "ringtone and billboards", text: "The opened page mentions the ringtone and billboards being torn down." };
  }
  return { title: "A file on the taxis he drove", url: "https://www.example.edu/taxis", domain: "example.edu", snippet: "The file mentions the taxis.", opened: true, text: "The opened page discusses the taxis he drove and does not close the question." };
}

const usable: RetrievedSource[] = [{
  title: "A file on the taxis he drove",
  url: "https://www.example.edu/taxis",
  domain: "example.edu",
  snippet: "The file mentions the taxis.",
  opened: true,
  text: "The opened page discusses the taxis he drove and does not close the question.",
}];
const statehouse: RetrievedSource[] = [
  "NIGERIA’S EDUCATION BUDGET JUMPS TO ₦3.52TRN UNDER PRESIDENT TINUBU",
  "President Tinubu Remains Committed to Girl-Child Education",
  "President Tinubu Appoints Governing Council of 2 Federal Universities",
  "President Tinubu Approves Renewed Hope Infrastructure Development Fund",
  "PRESIDENT TINUBU, REBUILDING ECONOMIC PILLARS",
].map((title, index) => ({ title, url: `https://statehouse.gov.ng/page-${index}`, domain: "statehouse.gov.ng", opened: false, snippet: title }));

function ports(log: { research: number; draft: number }, behavior: { research?: "usable" | "insufficient" | "snippet" | "fail"; draft?: "good" | "bad" | "fail" | "forecast" }): DevelopmentPorts {
  return {
    research: async () => {
      log.research += 1;
      if (behavior.research === "fail") return { ok: false, called: true, label: "none", sources: [], message: "The research provider did not answer." };
      if (behavior.research === "insufficient") return { ok: true, called: true, label: "insufficient", sources: statehouse, message: "Search results were stored." };
      if (behavior.research === "snippet") return { ok: true, called: true, label: "insufficient", sources: [{ title: "Report of the taxis he drove", url: "https://example.edu/taxis", domain: "example.edu", opened: false, snippet: "A headline mentions the taxis." }], message: "Search results were stored." };
      return { ok: true, called: true, label: "usable", sources: [openedFor(currentKind)], message: "Search results were stored." };
    },
    draft: async () => {
      log.draft += 1;
      if (behavior.draft === "fail") return { ok: false, called: true, drafts: [], message: "The draft provider did not answer." };
      const source = behavior.draft === "forecast"
        ? "Tinubu will not survive 2027."
        : behavior.draft === "bad"
          ? "We verified the claim. This is true."
          : "";
      return { ok: true, called: true, drafts: [{ style: "conversational", text: source || goodDraft(log) }], message: "Drafts saved." };
    },
  };
}

let currentKind = "";
function goodDraft(log: { research: number }) {
  if (currentKind === "taxi") return "Tinubu says he drove taxis to fund university. example.edu has an opened page on the taxis. This is not a closed verdict.";
  if (currentKind === "investment") return "The post rejects another person's claim that foreign companies are investing because of Tinubu. example.edu is the page on file, and this is not a verdict.";
  if (currentKind === "ringtone") return "The post pairs an opinion with a ringtone and billboards being torn down. example.edu is the page on file. The opinion was not independently verified.";
  if (currentKind === "atiku") return "The post reports that Atiku led the ADC to the Sultan's palace. This desk has not confirmed the visit. The other lines are commentary.";
  if (currentKind === "prediction") return "The post speculates that there is no way Tinubu will survive 2027. That is not a result, and this desk does not forecast the election.";
  return `The post was not independently verified. ${log.research}`;
}

async function run(source: string, kind: string, behavior: Parameters<typeof ports>[1]) {
  currentKind = kind;
  const log = { research: 0, draft: 0 };
  const state = await advanceDevelopment(initialDevelopment(source), ports(log, behavior));
  return { state, log };
}

async function main() {
const taxiPreview = developmentPreview(taxi);
check("taxi attribution requires research from the source text", taxiPreview.blocked === false && taxiPreview.researchSearches > 0 && taxiPreview.modelRequests === 1 && taxiPreview.researchNeed === "yes");
const taxiRun = await run(taxi, "taxi", { research: "usable", draft: "good" });
check("taxi reaches ready only after research and a sourced draft", taxiRun.state.ready === true && taxiRun.log.research === 1 && taxiRun.log.draft === 1);
check("taxi angle keeps the claim with Tinubu", /tinubu|speaker|account/i.test(taxiRun.state.angle || ""));

const investmentPreview = developmentPreview(investment);
check("a rejected foreign-investment claim still requires research", investmentPreview.researchNeed === "yes" && investmentPreview.researchSearches > 0 && /does not assert|reject/i.test(investmentPreview.summary));
const investmentRun = await run(investment, "investment", { research: "usable", draft: "good" });
check("the investment draft is not treated as the author's assertion", investmentRun.state.ready && /reject|another person/i.test(investmentRun.state.angle || ""));

const ringtonePreview = developmentPreview(ringtone);
check("ringtone and billboard sentences require research inside an opinion", ringtonePreview.researchNeed === "yes" && ringtonePreview.premises.length >= 2);
const ringtoneRun = await run(ringtone, "ringtone", { research: "usable", draft: "good" });
check("the ringtone post can be drafted once evidence is usable", ringtoneRun.state.ready && ringtoneRun.log.research === 1);

const atikuPreview = developmentPreview(atiku);
check("the palace visit is recommended research, not praise alone", atikuPreview.primaryKind === "event" && atikuPreview.researchSearches > 0 && atikuPreview.blocked === false);
const atikuRun = await run(atiku, "atiku", { research: "insufficient", draft: "good" });
check("an unconfirmed visit stays a report", atikuRun.state.ready && /not confirmed|has not confirmed/i.test(atikuRun.state.drafts[0]?.text || ""));

const predictionPreview = developmentPreview(prediction);
check("a 2027 prediction is not sent to research", predictionPreview.researchSearches === 0 && predictionPreview.modelRequests === 1 && predictionPreview.primaryKind === "prediction");
const forecast = await run(prediction, "prediction", { draft: "forecast" });
check("an unsupported forecast does not become ready", forecast.state.ready === false && forecast.state.review === "Needs editorial review" && forecast.log.research === 0);
const speculation = await run(prediction, "prediction", { draft: "good" });
check("a framed prediction can be reviewed by the editor", speculation.state.ready && /not a result|does not forecast/i.test(speculation.state.drafts[0]?.text || ""));

const rhetoricPreview = developmentPreview(rhetoric);
check("rhetoric is not a research or drafting candidate", rhetoricPreview.blocked && rhetoricPreview.researchSearches === 0 && rhetoricPreview.modelRequests === 0);
const rhetoricRun = await run(rhetoric, "rhetoric", { research: "usable", draft: "good" });
check("rhetoric makes no provider call", rhetoricRun.log.research === 0 && rhetoricRun.log.draft === 0 && rhetoricRun.state.ready === false);

const ambiguousPreview = developmentPreview(ambiguous);
check("ambiguous attribution blocks factual drafting", ambiguousPreview.blocked && ambiguousPreview.review === "Needs editorial review" && ambiguousPreview.modelRequests === 0 && ambiguousPreview.researchSearches === 0);

const thin = await run(taxi, "taxi", { research: "insufficient", draft: "good" });
check("insufficient evidence for a required premise asks for review and does not draft", thin.state.review === "Needs editorial review" && thin.log.draft === 0 && thin.log.research === 1);

const failed = await run(taxi, "taxi", { research: "usable", draft: "fail" });
check("a draft failure keeps the research", failed.state.ready === false && failed.state.completed.includes("research") && failed.state.evidence?.label === "usable" && failed.log.draft === 1);
const retryLog = { research: 0, draft: 0 };
const retried = await advanceDevelopment(failed.state, ports(retryLog, { research: "usable", draft: "good" }));
check("retry calls the failed draft stage and not research again", retried.ready && retryLog.research === 0 && retryLog.draft === 1 && retried.evidence?.sources.length === failed.state.evidence?.sources.length);

const again = { research: 0, draft: 0 };
await advanceDevelopment(retried, ports(again, { research: "usable", draft: "good" }));
check("a completed development does not call providers again", again.research === 0 && again.draft === 0);

const published: DevelopmentState = { ...initialDevelopment(taxi), published: true };
const publishedLog = { research: 0, draft: 0 };
const publishedRun = await advanceDevelopment(published, ports(publishedLog, { research: "usable", draft: "good" }));
check("a published story is not developed again", publishedRun.ready === false && publishedLog.research === 0 && publishedLog.draft === 0 && /stays published/i.test(publishedRun.unresolved || ""));

const exact = postCreateBody("The editor approved this sentence.");
check("publishing sends the approved text unchanged", exact.text === "The editor approved this sentence." && !("hashtag" in exact) && !JSON.stringify(exact).includes("#"));

const savedTaxi = classifyEvidence({
  premises: ["Tinubu says he drove taxis in the US to fund his university education."],
  sources: statehouse,
  searchCompleted: true,
});
check("the five statehouse pages do not address the taxi premise", savedTaxi.evidenceStatus === "EVIDENCE_INSUFFICIENT" && savedTaxi.searchStatus === "SEARCH_COMPLETED" && savedTaxi.readings.every((item) => item.stance === "does_not_address" && item.opened === false));
const mentioned = await run(taxi, "taxi", { research: "snippet", draft: "good" });
check("an unopened relevant snippet is not evidence ready and is not drafted", mentioned.state.evidenceStatus === "RELEVANT_EVIDENCE_FOUND" && mentioned.state.ready === false && mentioned.log.draft === 0 && mentioned.state.failureKind === "inadequate evidence");
const stale: DevelopmentState = {
  ...initialDevelopment(taxi),
  completed: ["interpret", "research", "angle"],
  angle: "Keep the claim with the speaker the post names. Do not move it onto the posting account.",
  anglePoints: ["Do not say the claim was independently verified."],
  evidence: { label: "usable", sources: statehouse },
  evidenceStatus: "EVIDENCE_READY",
  searchStatus: "SEARCH_COMPLETED",
  draftFailed: true,
  error: "AI OUTPUT REJECTED BY EDITORIAL VALIDATOR",
};
const staleLog = { research: 0, draft: 0 };
const revalidated = await advanceDevelopment(stale, ports(staleLog, { research: "usable", draft: "good" }));
check("retry revalidates stored evidence before any draft call", revalidated.ready === false && revalidated.review === "Needs editorial review" && staleLog.draft === 0 && staleLog.research === 0 && revalidated.completed.includes("research") && revalidated.angle === stale.angle);
const openedLater: DevelopmentState = { ...revalidated, evidence: { label: "insufficient", sources: usable }, draftFailed: false, review: null, gateFailed: false };
const resumedLog = { research: 0, draft: 0 };
const resumed = await advanceDevelopment(openedLater, ports(resumedLog, { draft: "good" }));
check("opened relevant evidence resumes drafting without a new search", resumed.ready === true && resumedLog.research === 0 && resumedLog.draft === 1);
const taxiPrompt = developmentDraftPrompt({
  claim: "Tinubu says he drove taxis in the US to fund his university education.",
  postText: taxi,
  verdict: "UNVERIFIED",
  confidence: "low",
  angleTitle: "Keep the claim with Tinubu.",
  anglePoints: ["Do not forecast an election."],
  take: null,
  evidence: [],
  attribution: "The post attributes this claim to Tinubu.",
  interpretation: "The post attributes this claim to Tinubu: he drove taxis in the US to fund his university education.",
  premises: ["Tinubu says he drove taxis in the US to fund his university education."],
  limitations: "No opened source addresses the taxi premise.",
});
check("the development prompt is built from this post and not the 453 story", taxiPrompt.user.includes("Tinubu") && taxiPrompt.user.includes("taxis") && !taxiPrompt.system.includes("453 is false") && !taxiPrompt.system.includes("AI-generated photographs"));
check("the desk prompt for the same post also leaves the 453 story out", !draftPrompt({ claim: "Tinubu says he drove taxis in the US to fund his university education.", postText: taxi, verdict: "UNVERIFIED", confidence: "low", angleTitle: "Angle", anglePoints: [], take: null, evidence: [] }).system.includes("176,846"));
const further = furtherSearchPreview();
check("a further search is previewed and not started", further.searches === 3 && further.modelRequests === 0 && /until you confirm/i.test(further.message));

const route = readFileSync("app/api/desk/develop/route.ts", "utf8");
const machine = readFileSync("lib/editorial/develop.ts", "utf8");
check("development is a manual preview then start", route.includes("preview") && route.includes("start") && !/cron|schedule/i.test(route));
check("the route does not publish or call X", !/publishApprovedPost|api\/x\/publish/.test(route));
check("routing uses describeSource and not the stored research flag", machine.includes("describeSource") && !machine.includes("research_required"));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("develop checks passed");
}

main();
