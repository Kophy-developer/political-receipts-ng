import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { claimOnce, editorAccess } from "../lib/auth/access";
import { applyPass, arrangeDesk, numberWithinScan, restoreCard, type DeskCard } from "../lib/desk/board";
import { storyReading, storyStates } from "../lib/desk/research-state";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const latest = "scan-new";
const cards: DeskCard[] = [
  { id: "a", conversationId: "c1", scanId: latest, rank: 1, lifecycle: "RANKED", discoveredAt: "2026-11-06T12:00:00Z", title: "new one" },
  { id: "b", conversationId: "c2", scanId: latest, rank: 1, lifecycle: "RANKED", discoveredAt: "2026-11-06T12:01:00Z", title: "new two" },
  { id: "c", conversationId: "c3", scanId: "scan-old", rank: 1, lifecycle: "RANKED", discoveredAt: "2026-11-05T12:00:00Z", title: "old one" },
  { id: "d", conversationId: "c4", scanId: latest, rank: 3, lifecycle: "RESEARCHING", discoveredAt: "2026-11-06T12:02:00Z", title: "working" },
  { id: "e", conversationId: "c5", scanId: latest, rank: 4, lifecycle: "PASSED", discoveredAt: "2026-11-06T12:03:00Z", title: "passed" },
  { id: "f", conversationId: "c6", scanId: latest, rank: 2, lifecycle: "READY_FOR_EDITOR", discoveredAt: "2026-11-06T12:04:00Z", title: "ready" },
];
const board = arrangeDesk(cards, latest);
check("new scan is not mixed with an older scan", board.thisScan.every((card) => card.scanId === latest) && board.earlier.some((card) => card.id === "c") && !board.thisScan.some((card) => card.id === "c"));
check("display numbers are unique and sequential", board.thisScan.map((card) => card.displayNumber).join(",") === "1,2");
check("stored ranks are not rewritten", cards.find((card) => card.id === "a")?.rank === 1 && cards.find((card) => card.id === "b")?.rank === 1);
check("one working card stays out of this scan", board.working.map((card) => card.id).join(",") === "d" && board.ready.map((card) => card.id).join(",") === "f" && board.passed.map((card) => card.id).join(",") === "e");

const removed = applyPass(board.thisScan, "a");
check("pass removes one card", removed.length === 1 && removed[0]?.id === "b");
const restored = restoreCard(removed, board.thisScan[0]!, 0);
check("a failed pass puts the card back", restored[0]?.id === "a" && restored.length === 2);

const numbered = numberWithinScan([
  { id: "z", rank: 8, discoveredAt: "2026-11-06T10:00:00Z" },
  { id: "y", rank: 2, discoveredAt: "2026-11-06T11:00:00Z" },
  { id: "x", rank: 2, discoveredAt: "2026-11-06T09:00:00Z" },
]);
check("ties keep a stable sequence", numbered.map((card) => `${card.displayNumber}:${card.id}`).join(",") === "1:x,2:y,3:z");

check("not started is explicit", storyReading({}).state === "Not started" && storyReading({}).reason.length > 0);
check("searching is explicit", storyReading({ lifecycle: "RESEARCHING" }).state === "Researching");
check("unopened sources stay in research", storyReading({ searchStatus: "SEARCH_COMPLETED", evidenceStatus: "RELEVANT_EVIDENCE_FOUND", sources: [{ title: "State House", opened: false }] }).state === "Researching" && /is proof/.test(storyReading({ searchStatus: "SEARCH_COMPLETED", evidenceStatus: "RELEVANT_EVIDENCE_FOUND", sources: [{ title: "State House", opened: false }] }).reason));
check("insufficient evidence needs attention and keeps the reason", storyReading({ evidenceStatus: "EVIDENCE_INSUFFICIENT", error: "No page addressed the debt figure." }).state === "Needs attention" && /debt figure/.test(storyReading({ evidenceStatus: "EVIDENCE_INSUFFICIENT", error: "No page addressed the debt figure." }).reason));
check("opened evidence is analysis", storyReading({ evidenceStatus: "EVIDENCE_READY", sources: [{ title: "Budget", opened: true }] }).state === "Analyzing");
check("drafting is writing", storyReading({ lifecycle: "DRAFTING" }).state === "Writing");
check("ready is named", storyReading({ lifecycle: "READY_FOR_EDITOR" }).state === "Ready for You");
check("a failed step needs attention", storyReading({ researchFailed: true, error: "The search stopped." }).state === "Needs attention" && /search stopped/.test(storyReading({ researchFailed: true, error: "The search stopped." }).reason));
check("every story state is one of the six", storyStates.length === 6 && storyStates.join(",") === "Not started,Researching,Analyzing,Writing,Ready for You,Needs attention");

check("a cross-origin write is refused", editorAccess({ sameOrigin: false }).status === 403);
check("a same-origin write is allowed", editorAccess({ sameOrigin: true }).ok === true);

const seen = new Set<string>();
check("a confirmation nonce is single use", claimOnce(seen, "nonce-1") === true && claimOnce(seen, "nonce-1") === false && claimOnce(seen, "nonce-2") === true);
check("password auth files are gone", !existsSync("lib/auth/password.ts") && !existsSync("lib/auth/token.ts") && !existsSync("app/api/auth/editor/route.ts"));

const publish = readFileSync("app/api/x/publish/route.ts", "utf8");
const publishRules = readFileSync("lib/x/publish.ts", "utf8");
check("publish confirmation is durable", publish.includes("claimPublishConfirmation") && !publish.includes("reservePostNonce"));
check("exact text confirmation remains", publishRules.includes("confirm") && publish.includes("validatePublishRequest"));
check("writes still require a same-origin request", readFileSync("app/api/opportunities/decision/route.ts", "utf8").includes("assertEditorRequest") && readFileSync("lib/x/guard.ts", "utf8").includes("sameOrigin") && !readFileSync("lib/x/guard.ts", "utf8").includes("EDITOR_PASSWORD"));
check("the desk page now redirects to the approval queue", readFileSync("app/desk/page.tsx", "utf8").includes('redirect("/")') && readFileSync("components/desk/scan-board.tsx", "utf8").includes("Pass"));
check("primary navigation is Approve, Published, Settings", readFileSync("lib/nav.ts", "utf8").includes('label: "Approve"') && readFileSync("lib/nav.ts", "utf8").includes('label: "Published"') && readFileSync("lib/nav.ts", "utf8").includes('label: "Settings"') && !readFileSync("lib/nav.ts", "utf8").includes('label: "Ready for You"'));

const fixture = Array.from({ length: 400 }, (_, index) => ({
  id: `card-${index}`,
  conversationId: `conversation-${index}`,
  scanId: index < 30 ? latest : "scan-old",
  rank: (index % 9) + 1,
  lifecycle: index % 17 === 0 ? "RESEARCHING" : "RANKED",
  discoveredAt: "2026-11-06T12:00:00Z",
  title: `Card ${index}`,
}));
const passStarted = performance.now();
let passing = fixture;
for (let index = 0; index < 50; index += 1) passing = applyPass(passing, `card-${index}`);
const passMs = performance.now() - passStarted;
const arrangeStarted = performance.now();
for (let index = 0; index < 50; index += 1) arrangeDesk(fixture, latest);
const arrangeMs = performance.now() - arrangeStarted;
console.log(`fixture pass ${passMs.toFixed(2)} ms for 50 removals on 400 cards; fixture arrange ${arrangeMs.toFixed(2)} ms for 50 full rearrangements. These are local fixture timings, not production desk latency.`);
check("pass on the fixture stays under a quarter second", passMs < 250);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("desk phase 1 checks passed");
