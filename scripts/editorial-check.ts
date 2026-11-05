import { readFileSync } from "node:fs";
import { assessAndRank, assessConversation } from "../lib/editorial/assess";
import { storedScanFixture } from "../lib/editorial/fixture";
import {
  automaticStages,
  cadence,
  costGuard,
  deskSections,
  mergeAssessments,
  nextAssessmentVersion,
  progressPlan,
  promotePassed,
  publicationSlots,
  researchJobs,
  settleIndependently,
} from "../lib/editorial/model";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const batch = assessAndRank(storedScanFixture, "2026-11-05T12:00:00.000Z");
const byId = (id: string) => batch.find((item) => item.id === id);
const kept = batch.filter((item) => item.worthTalkingAbout);
const passed = batch.filter((item) => !item.worthTalkingAbout);
const ranks = kept.map((item) => item.rank).sort((left, right) => (left ?? 0) - (right ?? 0));

check("one scan can keep more than one opportunity", kept.length >= 2);
check("worthwhile items are ranked 1..N", ranks.join(",") === kept.map((_, index) => String(index + 1)).join(","));
check("ranks are only on worthwhile items", passed.every((item) => item.rank === null) && kept.every((item) => item.rank !== null));
check("worthwhile items can have different types", new Set(kept.map((item) => item.opportunityType)).size >= 2);
check("worthwhile items can have different research needs", new Set(kept.map((item) => item.researchNeed)).size >= 2);
check("weak material can still be passed over", passed.length >= 1);
check("an opportunity does not require a claim row", kept.every((item) => item.claimRequired === false));
check("no assessment assigns a factual verdict", batch.every((item) => item.factualVerdict === null));

const taxi = byId("taxi-university");
check(
  "a taxi/university attribution can be a check that needs research",
  taxi?.worthTalkingAbout === true && taxi.opportunityType === "check" && taxi.researchNeed === "yes" && taxi.claimExtractionNeeded === true,
);
const ringtone = byId("ringtone-billboards");
check(
  "ringtone and billboard assertions can be a check or an analysis that needs research",
  ringtone?.worthTalkingAbout === true
    && (ringtone.opportunityType === "check" || ringtone.opportunityType === "analysis")
    && ringtone.researchNeed === "yes"
    && ringtone.claimExtractionNeeded === true,
);
const visit = byId("sultan-visit");
check(
  "a visit can be a reaction or an analysis with research recommended",
  visit?.worthTalkingAbout === true
    && (visit.opportunityType === "reaction" || visit.opportunityType === "analysis")
    && visit.researchNeed === "recommended"
    && visit.claimExtractionNeeded === false,
);
const economy = byId("investment");
check(
  "an investment assertion can be a check, an analysis, or an original insight that needs research",
  economy?.worthTalkingAbout === true
    && (economy.opportunityType === "check" || economy.opportunityType === "analysis" || economy.opportunityType === "original_insight")
    && economy.researchNeed === "yes",
);
const praise = byId("obi-praise");
check(
  "subjective praise is not a factual check",
  praise?.opportunityType !== "check" && praise?.claimExtractionNeeded === false && praise?.factualVerdict === null,
);
const tsunami = byId("tsunami-2027");
const turnaround = byId("turnaround");
const crowd = byId("crowd-votes");
check(
  "a 2027 prediction is not a factual check and does not forecast a winner",
  tsunami?.opportunityType !== "check"
    && tsunami?.claimExtractionNeeded === false
    && tsunami?.factualVerdict === null
    && tsunami?.voice === "prediction"
    && (tsunami?.opportunityType === "question" || tsunami?.opportunityType === "analysis" || tsunami?.worthTalkingAbout === false)
    && (tsunami?.possibleAngle ?? "").toLowerCase().includes("do not forecast"),
);
check(
  "a turnaround prediction is not a factual verdict",
  turnaround?.opportunityType !== "check" && turnaround?.factualVerdict === null && turnaround?.claimExtractionNeeded === false,
);
check(
  "crowd voting speculation is not a factual check",
  crowd?.opportunityType !== "check" && crowd?.claimExtractionNeeded === false && crowd?.factualVerdict === null,
);
check("an insult can be passed over", byId("insult")?.worthTalkingAbout === false);

const promoted = promotePassed(byId("insult")!, kept.length);
check(
  "a passed conversation can be promoted without another model",
  promoted.worthTalkingAbout === true && promoted.lifecycle === "RANKED" && promoted.rank === kept.length + 1 && promoted.passReason === null,
);

const settled = settleIndependently([1, 2, 3], (item) => {
  if (item === 2) throw new Error("research failed");
  return item;
});
check("one failure does not block the others", settled.completed.join(",") === "1,3" && settled.failed.length === 1);

const history = mergeAssessments(["claim-first-card"], ["new-assessment"]);
check("a reassessment keeps the historical card", history.deleted.length === 0 && history.kept[0] === "claim-first-card" && history.added[0] === "new-assessment");
check("a reassessment versions forward", nextAssessmentVersion(1) === 2 && nextAssessmentVersion(null) === 1);

const yesPlan = progressPlan({ worthTalkingAbout: true, researchNeed: "yes", lifecycle: "RANKED" });
const recommended = progressPlan({ worthTalkingAbout: true, researchNeed: "recommended", lifecycle: "RANKED" });
const recommendedOn = progressPlan(
  { worthTalkingAbout: true, researchNeed: "recommended", lifecycle: "RANKED" },
  { autoProgressToEditor: false, researchRecommended: true },
);
const none = progressPlan({ worthTalkingAbout: true, researchNeed: "no", lifecycle: "RANKED" });
check("research yes plans research and does not run it", yesPlan.next === "RESEARCHING" && yesPlan.executed === false && yesPlan.externalCalls.length === 0);
check("research recommended stays ranked until a setting allows it", recommended.next === "RANKED" && recommended.executed === false);
check("research recommended can be planned when the setting is on", recommendedOn.next === "RESEARCHING" && recommendedOn.externalCalls.length === 0);
check("research no moves toward an angle and does not call research", none.next === "ANGLE_READY" && none.externalCalls.length === 0);

const load = researchJobs([
  { worthTalkingAbout: true, researchNeed: "yes" },
  { worthTalkingAbout: true, researchNeed: "yes" },
  { worthTalkingAbout: true, researchNeed: "recommended" },
  { worthTalkingAbout: true, researchNeed: "recommended" },
  { worthTalkingAbout: true, researchNeed: "no" },
]);
check("five opportunities do not become five research jobs", load.length === 2);

const auto = automaticStages(
  { worthTalkingAbout: true, researchNeed: "yes" },
  { autoProgressToEditor: true, researchRecommended: false },
);
check(
  "auto-progress can reach the editor and cannot publish by itself",
  auto.includes("READY_FOR_EDITOR") && !auto.includes("PUBLISHED") && !auto.includes("APPROVED"),
);
check("auto-progress is off by default", automaticStages({ worthTalkingAbout: true, researchNeed: "yes" }, { autoProgressToEditor: false, researchRecommended: false }).length === 0);

const guard = costGuard();
check("cost ceilings stay at the scan budget", guard.xRequestsPerScan === 1 && guard.dailyXRequests === 4 && guard.autoResearch === false && guard.autoPublish === false);
check("publication is not scheduled yet", cadence.maxApprovedPerHour === null && publicationSlots({ approved: 5, perHour: null }) === 0);
check("a future hourly cap would not need a new scan", publicationSlots({ approved: 5, perHour: 1 }) === 1);

const apc = assessConversation("APC is said to have paid ₦4 billion for the state billboards.");
const pdp = assessConversation("PDP is said to have paid ₦4 billion for the state billboards.");
const tinubu = assessConversation("Tinubu is said to have driven a taxi to pay his university fees.");
const obi = assessConversation("Obi is said to have driven a taxi to pay his university fees.");
check("party names do not change the content score", apc.contentScore === pdp.contentScore && apc.opportunityType === pdp.opportunityType);
check("politician names do not change the content score", tinubu.contentScore === obi.contentScore && tinubu.opportunityType === obi.opportunityType);

const duplicated = assessAndRank([
  { id: "first", text: "A minister is said to have paid ₦2 billion for the new billboards." },
  { id: "second", text: "A minister is said to have paid ₦2 billion for the new billboards." },
]);
check("a duplicate conversation is passed and the first is kept", duplicated[0]?.worthTalkingAbout === true && duplicated[1]?.worthTalkingAbout === false && duplicated[1]?.passReason === "Duplicate conversation.");

check(
  "the desk sections are the editorial pipeline",
  deskSections.join("|") === "Discover|Ready for you|Content queue|In progress|Recently published|Passed over|Recent scans",
);

const reassess = readFileSync("app/api/intel/reassess/route.ts", "utf8");
const assessSource = readFileSync("lib/editorial/assess.ts", "utf8");
const editorialDb = readFileSync("lib/db/editorial.ts", "utf8");
check("reassess does not call X, a model, or research", !/extractFromPosts|callProvider|searchRecent|tavily|brave|publish\(|@\/lib\/x\/publish|@\/lib\/ai/.test(reassess));
check("assessment does not fetch", !/fetch\(|@\/lib\/x|@\/lib\/ai|@\/lib\/research\/execute/.test(assessSource));
check("saving an assessment does not call X", /xRequests: 0/.test(editorialDb) && !/extractFromPosts|searchRecent|callProvider/.test(editorialDb));

const discovered = kept.every((item) => item.discoveredAt === "2026-11-05T12:00:00.000Z" && item.timeliness && item.lifecycle === "RANKED");
check("queue items carry discovered time, timeliness, rank, and status", discovered);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("editorial checks passed", {
  kept: kept.length,
  passed: passed.length,
  types: [...new Set(kept.map((item) => item.opportunityType))],
  research: [...new Set(kept.map((item) => item.researchNeed))],
});
