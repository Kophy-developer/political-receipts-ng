import { readFileSync } from "node:fs";
import { postCreateBody } from "../lib/publish/payload";
import {
  advanceDevelopment,
  developmentPreview,
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

const usable: RetrievedSource[] = [{ title: "University records", url: "https://www.example.edu/tinubu", domain: "example.edu" }];

function ports(log: { research: number; draft: number }, behavior: { research?: "usable" | "insufficient" | "fail"; draft?: "good" | "bad" | "fail" | "forecast" }): DevelopmentPorts {
  return {
    research: async () => {
      log.research += 1;
      if (behavior.research === "fail") return { ok: false, called: true, label: "none", sources: [], message: "The research provider did not answer." };
      if (behavior.research === "insufficient") return { ok: true, called: true, label: "insufficient", sources: [{ title: "A social post", url: "https://x.com/example/status/1", domain: "x.com" }], message: "Search results were stored." };
      return { ok: true, called: true, label: "usable", sources: usable, message: "Search results were stored." };
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
  if (currentKind === "taxi") return "Tinubu says he drove taxis to fund university. example.edu has a page on file. This is not a closed verdict.";
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
