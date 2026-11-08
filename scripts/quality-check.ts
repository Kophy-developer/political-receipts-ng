import { readFileSync } from "node:fs";
import { splitByCurrentVersion } from "../lib/editorial/history";
import { describeSource, replaceUserLabel } from "../lib/editorial/quality";
import { routeUnderstanding, type ConversationUnderstanding } from "../lib/editorial/understand";
import type { ConversationPacket } from "../lib/editorial/packet";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

type Expectation = {
  name?: string;
  text: string;
  kind?: string;
  research?: string;
  check?: boolean;
  lowValue?: boolean;
  drafting?: boolean;
  review?: boolean;
  matched?: boolean;
  summary?: string[];
  premise?: string[];
  absent?: string[];
};

const fixture = JSON.parse(readFileSync("scripts/fixtures/understanding-quality-posts.json", "utf8")) as {
  posts: Expectation[];
  extra: Expectation[];
};

function expectQuality(item: Expectation) {
  const name = item.name ?? item.text.slice(0, 48);
  const described = describeSource(item.text);
  if (item.matched === false) {
    check(`${name} is left unmatched`, described.matched === false && described.researchNeed === "no");
    return;
  }
  check(`${name} is classified from the source`, described.matched === true && described.primaryKind === item.kind && described.researchNeed === item.research);
  check(`${name} research route`, item.check ? described.routes.includes("CHECK") : described.routes.includes("CHECK") === false);
  if (item.lowValue != null) check(`${name} low value`, described.lowValue === item.lowValue);
  if (item.drafting != null) check(`${name} drafting`, described.draftingCandidate === item.drafting);
  check(`${name} review`, item.review ? described.review === "Needs editorial review" : described.review === null);
  const summary = described.summary.toLowerCase();
  for (const part of item.summary ?? []) check(`${name} summary includes ${part}`, summary.includes(part.toLowerCase()));
  const facts = described.checkableFacts.join(" ").toLowerCase();
  for (const part of item.premise ?? []) check(`${name} premise includes ${part}`, facts.includes(part.toLowerCase()));
  const blob = `${described.summary} ${described.reason}`.toLowerCase();
  for (const part of item.absent ?? []) check(`${name} does not say ${part}`, !blob.includes(part.toLowerCase()));
}

for (const item of [...fixture.posts, ...fixture.extra]) expectQuality(item);

check("the user is renamed to the post", replaceUserLabel("The user reports that the user was quoted.") === "The post reports that the post was quoted.");

const rules = readFileSync("lib/editorial/quality.ts", "utf8");
check("quality rules do not hardcode the recovered conversation ids", !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(rules));

const packet = (text: string): ConversationPacket => ({
  id: "stored-text",
  pillar: "politics",
  posts: [{ text, handle: "@desk", postedAt: "2026-11-06T12:00:00.000Z", relationship: null }],
});
const reading = (kind: ConversationUnderstanding["primaryKind"]): ConversationUnderstanding => ({
  conversationId: "stored-text",
  summary: "The user comments that both sides are true.",
  subjects: [],
  primaryKind: kind,
  checkableFacts: [],
  dataOrNumbersInvolved: false,
  eventOrDevelopment: false,
  predictionPresent: kind === "prediction",
  opinionPresent: kind === "opinion",
  possibleRoutes: ["CHECK"],
  researchNeed: "no",
  reasonForResearchNeed: "The text is a judgment.",
  understood: true,
});
const hate = routeUnderstanding(packet("I hate those billboards."), reading("opinion"), 0, Date.parse("2026-11-06T16:00:00.000Z"));
check("a billboard complaint does not become research from the word alone", hate.researchNeed === "no" && hate.routes.includes("CHECK") === false && !hate.summary.toLowerCase().includes("the user"));
const torn = routeUnderstanding(packet("People disagree. APC billboards are being torn down in the north."), reading("opinion"), 0, Date.parse("2026-11-06T16:00:00.000Z"));
check("a demolition sentence still requires research when the model calls the post opinion", torn.researchNeed === "yes" && torn.routes.includes("CHECK") && torn.summary.toLowerCase().includes("opinion"));

const split = splitByCurrentVersion([
  { id: "old", conversationId: "conversation", source: "assessment", version: 1 },
  { id: "current", conversationId: "conversation", source: "assessment", version: 3 },
  { id: "duplicate", conversationId: "conversation", source: "model", version: null },
  { id: "rejected", conversationId: "conversation", source: "assessment", version: 2 },
  { id: "unrelated", conversationId: "other", source: "rules", version: null },
]);
check(
  "only the newest assessment is current",
  split.current.map((item) => item.id).sort().join(",") === "current,unrelated"
    && split.history.map((item) => item.id).sort().join(",") === "duplicate,old,rejected",
);

const desk = readFileSync("app/desk/page.tsx", "utf8");
const scanBoard = readFileSync("components/desk/scan-board.tsx", "utf8");
const board = readFileSync("components/opportunities/board.tsx", "utf8");
check(
  "the current scan does not present a recovered model response as its outcome",
  !desk.includes("Recovered from 1 previous AI model response.")
    && !scanBoard.includes("Recovered from 1 previous AI model response.")
    && board.includes("Previous assessment versions")
    && board.includes("not current")
    && desk.includes('redirect("/")'),
);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("quality checks passed");
