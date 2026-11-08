import { readFileSync } from "node:fs";
import { arrangeDesk, storyCounts, storyReturn } from "../lib/desk/board";
import { advanceDevelopment, developmentPreview, initialDevelopment, nextStep } from "../lib/editorial/develop";
import { investigate } from "../lib/research/investigate";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const financeScan = "d26d6023-3dd0-474b-acca-650cf2080608";
const unitedScan = "27ae0489-e780-4f61-ad81-f24f656043fd";
const financeCard = {
  id: "d050350c-7e3f-47f9-b22b-5bac2bfca35b",
  conversationId: "80682a49-75d0-4c84-8f70-86a55bb1f6f8",
  scanId: financeScan,
  rank: 1,
  lifecycle: "RANKED",
  discoveredAt: "2026-11-08T11:56:46.881Z",
  title: "President Tinubu borrowed $100 billion",
  pillar: "finance",
  storyState: "Not started",
};
const unitedCard = {
  id: "f695e939-4675-474a-a3ff-96766b3a48c1",
  conversationId: "789344c9-6082-4698-b598-fb9d1cdf9982",
  scanId: unitedScan,
  rank: 1,
  lifecycle: "RANKED",
  discoveredAt: "2026-11-08T11:58:01.736Z",
  title: "The post is a supporter's reaction.",
  pillar: "football",
  storyState: "Not started",
};
const board = arrangeDesk([financeCard, unitedCard], unitedScan);
check("a finance story stays findable after the Manchester United scan", board.earlier.some((card) => card.id === financeCard.id) && board.thisScan.some((card) => card.id === unitedCard.id) && !board.thisScan.some((card) => card.id === financeCard.id));
const counts = storyCounts([financeCard, unitedCard]);
check("counts keep finance and Manchester United apart", counts.byPillar.finance === 1 && counts.byPillar.manchester_united === 1 && counts.byStage["Not started"] === 2 && counts.byScan.get(financeScan) === 1);

check("discover returns to Discover", storyReturn("discover").href === "/desk" && storyReturn("discover").label === "Back to Discover");
check("working returns to Working", storyReturn("working").href === "/desk?step=investigate#working" && storyReturn("working").label === "Back to Working");
check("a story returns to Investigate by default", storyReturn(undefined).href === "/desk?step=investigate" && storyReturn(undefined).label === "Back to Investigate");
check("a scan story returns to that scan", storyReturn("scan", financeScan).href === `/desk/scans/${financeScan}`);

const reaction = "United were brilliant today. What a performance from the lads.";
const reactionPreview = developmentPreview(reaction, { maxSearches: 3 }, "football");
check("a football reaction is not blocked and does not search", reactionPreview.blocked === false && reactionPreview.researchSearches === 0 && reactionPreview.modelRequests === 1 && nextStep(initialDevelopment(reaction, "football"), "football").kind === "angle");

const finance = "Debt stock rose from about N87tn in mid-2023 to N166.8tn by June 2026.";
const financePreview = developmentPreview(finance, { maxSearches: 3 }, "finance");
const financeState = initialDevelopment(finance, "finance");
const financeStep = nextStep(financeState, "finance");
const financePlan = investigate(finance, financeState.quality, "finance");
check("a finance figure enters research", financePreview.blocked === false && financePreview.researchSearches > 0 && financeStep.kind === "research");
check("finance research uses the official figure sources", financePlan.numerical && financePlan.preferredHosts.includes("dmo.gov.ng") && financePlan.preferredHosts.includes("cbn.gov.ng"));

const goals = "Manchester United have scored 5 goals in their last 5 games and won 1 game.";
const goalsState = initialDevelopment(goals, "football");
const goalsPlan = investigate(goals, goalsState.quality, "football");
check("a Manchester United record enters football research", nextStep(goalsState, "football").kind === "research" && goalsPlan.preferredHosts.includes("manutd.com") && goalsPlan.preferredHosts.includes("premierleague.com"));

const game = developmentPreview("In the eFootball Mobile 2026 game, Leeds United lost 1-3 to Manchester United.", { maxSearches: 3 }, "football");
check("a game score is not researched as a match", game.blocked === false && game.researchSearches === 0 && /not a Manchester United match/.test(game.summary));

const fixture = JSON.parse(readFileSync("scripts/fixtures/understanding-quality-posts.json", "utf8")) as { posts: Array<{ text: string }> };
const predictionText = fixture.posts.find((item) => item.text.includes("no way Tinubu will survive"))?.text ?? "";
const prediction = developmentPreview(predictionText, { maxSearches: 3 }, "politics");
check("a political prediction is not an election forecast", prediction.blocked === false && prediction.researchSearches === 0 && /not forecast/.test(prediction.message));

const ambiguous = developmentPreview("Foreign companies are investing in Nigeria because the economy is the best. Foreign companies do not invest in Nigeria.", { maxSearches: 3 }, "politics");
check("blocked research keeps a reason", ambiguous.blocked && /ambiguous/.test(ambiguous.message) && ambiguous.researchSearches === 0);

const repeated = developmentPreview(finance, { maxSearches: 3 }, "finance");
check("a repeated preview does not change the cost", repeated.researchSearches === financePreview.researchSearches && repeated.modelRequests === financePreview.modelRequests && repeated.message === financePreview.message);

const start = readFileSync("components/desk/start-story.tsx", "utf8");
const route = readFileSync("app/api/desk/develop/route.ts", "utf8");
const story = readFileSync("app/desk/work/[id]/page.tsx", "utf8");
const discover = readFileSync("components/desk/discover.tsx", "utf8");
check("Open story is the scan action", discover.includes(">Open story<") && discover.includes("?from=discover"));
check("the story starts the existing develop route", story.includes("<StartStory") && start.includes('"/api/desk/develop"') && route.includes("developContent") && route.includes("previewDevelopment"));
check("a second click does not send a second request", start.includes("if (busy.current) return"));

const publish = readFileSync("lib/x/publish.ts", "utf8");
check("exact-text confirmation still blocks publishing", publish.includes("input.confirm !== true") && publish.includes("The post needs an explicit final confirmation."));

async function main() {
  const calls = { research: 0, draft: 0 };
  const drafted = await advanceDevelopment(initialDevelopment(reaction, "football"), {
    research: async () => {
      calls.research += 1;
      return { ok: false, called: true, label: "none", sources: [], message: "Research should not run for a reaction." };
    },
    draft: async () => {
      calls.draft += 1;
      return { ok: true, called: false, drafts: [{ style: "conversational", text: "The post is a supporter's judgment about the performance. The score was not independently verified, and this desk is not adding one." }], message: "Draft held locally." };
    },
  }, "football");
  check("a reaction reaches a draft without research", calls.research === 0 && calls.draft === 1 && drafted.ready && !drafted.published && drafted.completed.includes("draft") && !drafted.completed.includes("research"));

  const blocked = await advanceDevelopment(initialDevelopment(finance, "finance"), {
    research: async () => ({ ok: false, called: false, label: "none", sources: [], message: "The research provider did not answer." }),
    draft: async () => {
      calls.draft += 1;
      return { ok: false, called: true, drafts: [], message: "A draft must not run after blocked research." };
    },
  }, "finance");
  check("blocked research shows the provider reason and does not draft", blocked.researchFailed && blocked.error === "The research provider did not answer." && calls.draft === 1 && !blocked.ready);

  const again = await advanceDevelopment({ ...drafted, running: false }, {
    research: async () => {
      calls.research += 1;
      return { ok: false, called: true, label: "none", sources: [], message: "A finished story was developed again." };
    },
    draft: async () => {
      calls.draft += 1;
      return { ok: false, called: true, drafts: [], message: "A finished story requested another draft." };
    },
  }, "football");
  check("a finished story does not spend again", again.ready && calls.research === 0 && calls.draft === 1);

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("story flow checks passed");
}

void main();
