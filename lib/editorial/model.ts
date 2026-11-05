import type { OpportunityType, ResearchNeed } from "@/lib/opportunities/types";
import { scanBudget } from "@/lib/intel/budget";

export const lifecycles = [
  "DISCOVERED",
  "ASSESSED",
  "RANKED",
  "RESEARCHING",
  "EVIDENCE_READY",
  "ANGLE_READY",
  "DRAFTING",
  "READY_FOR_EDITOR",
  "APPROVED",
  "PUBLISHED",
  "PASSED",
] as const;

export type Lifecycle = (typeof lifecycles)[number];

export const deskSections = [
  "Discover",
  "Ready for you",
  "Content queue",
  "In progress",
  "Recently published",
  "Passed over",
  "Recent scans",
] as const;

export type Priority = "high" | "medium" | "low";
export type Timeliness = "high" | "medium" | "low";

export type AutomationSettings = {
  autoProgressToEditor: boolean;
  researchRecommended: boolean;
};

export const automationDefaults: AutomationSettings = {
  autoProgressToEditor: false,
  researchRecommended: false,
};

export type Assessment = {
  worthTalkingAbout: boolean;
  opportunityType: OpportunityType | null;
  priority: Priority | null;
  researchNeed: ResearchNeed | null;
  timeliness: Timeliness;
  possibleAngle: string;
  reason: string;
  passReason: string | null;
  claimExtractionNeeded: boolean;
  claimRequired: false;
  factualVerdict: null;
  contentScore: number;
  voice: "fact" | "analysis" | "opinion" | "prediction" | "humour";
};

export type RankedConversation = Assessment & {
  id: string;
  text: string;
  title: string;
  rank: number | null;
  lifecycle: Lifecycle;
  nextStage: Lifecycle | null;
  discoveredAt: string;
};

export function typeLabel(type: string | null) {
  if (!type) return "NOTE";
  return type.replaceAll("_", " ").toUpperCase();
}

export function researchLabel(need: string | null) {
  if (need === "yes") return "Research required";
  if (need === "recommended") return "Research recommended";
  return "Research not needed";
}

export function priorityLabel(priority: string | null) {
  if (priority === "high") return "High priority";
  if (priority === "medium") return "Medium priority";
  if (priority === "low") return "Low priority";
  return "Unscored";
}

export function lifecycleLabel(lifecycle: string) {
  const labels: Record<string, string> = {
    DISCOVERED: "Discovered",
    ASSESSED: "Assessed",
    RANKED: "Ranked",
    RESEARCHING: "Researching",
    EVIDENCE_READY: "Evidence ready",
    ANGLE_READY: "Angle ready",
    DRAFTING: "Drafting",
    READY_FOR_EDITOR: "Ready for you",
    APPROVED: "Approved",
    PUBLISHED: "Published",
    PASSED: "Passed",
  };
  return labels[lifecycle] ?? lifecycle;
}

const inProgress = new Set<Lifecycle>(["RESEARCHING", "EVIDENCE_READY", "ANGLE_READY", "DRAFTING"]);

export function queueLifecycle(lifecycle: string) {
  return lifecycle === "RANKED" || lifecycle === "ASSESSED";
}

export function inProgressLifecycle(lifecycle: string) {
  return inProgress.has(lifecycle as Lifecycle);
}

export function readyLifecycle(lifecycle: string) {
  return lifecycle === "READY_FOR_EDITOR" || lifecycle === "APPROVED";
}

export function plannedNextStage(
  item: { worthTalkingAbout: boolean; researchNeed: ResearchNeed | null; lifecycle: Lifecycle },
  settings: AutomationSettings = automationDefaults,
): Lifecycle | null {
  if (!item.worthTalkingAbout || item.lifecycle === "PASSED") return null;
  if (item.lifecycle === "PUBLISHED" || item.lifecycle === "APPROVED") return null;
  if (item.lifecycle === "READY_FOR_EDITOR") return null;
  if (item.researchNeed === "yes") return "RESEARCHING";
  if (item.researchNeed === "recommended") return settings.researchRecommended ? "RESEARCHING" : "RANKED";
  return "ANGLE_READY";
}

/** Stages a future auto-progress mode may walk. Publication is never in this list. */
export function automaticStages(
  item: { worthTalkingAbout: boolean; researchNeed: ResearchNeed | null },
  settings: AutomationSettings,
): Lifecycle[] {
  if (!item.worthTalkingAbout || !settings.autoProgressToEditor) return [];
  const stages: Lifecycle[] = ["ASSESSED", "RANKED"];
  if (item.researchNeed === "yes" || (item.researchNeed === "recommended" && settings.researchRecommended)) {
    stages.push("RESEARCHING", "EVIDENCE_READY");
  }
  stages.push("ANGLE_READY", "DRAFTING", "READY_FOR_EDITOR");
  return stages;
}

export function progressPlan(
  item: { worthTalkingAbout: boolean; researchNeed: ResearchNeed | null; lifecycle: Lifecycle },
  settings: AutomationSettings = automationDefaults,
) {
  return {
    next: plannedNextStage(item, settings),
    stages: settings.autoProgressToEditor ? automaticStages(item, settings) : [item.lifecycle],
    executed: false as const,
    externalCalls: [] as const,
  };
}

export function researchJobs<T extends { worthTalkingAbout: boolean; researchNeed: ResearchNeed | null }>(
  items: T[],
  settings: AutomationSettings = automationDefaults,
) {
  return items.filter((item) => {
    if (!item.worthTalkingAbout) return false;
    if (item.researchNeed === "yes") return true;
    return item.researchNeed === "recommended" && settings.researchRecommended;
  });
}

export function costGuard() {
  return {
    xRequestsPerScan: scanBudget.maxXRequestsPerScan,
    dailyXRequests: scanBudget.dailyXRequests,
    dailyPosts: scanBudget.dailyPosts,
    autoResearch: false as const,
    autoPublish: false as const,
  };
}

export type CadencePolicy = {
  maxApprovedPerHour: number | null;
};

export const cadence: CadencePolicy = { maxApprovedPerHour: null };

export function publicationSlots(input: { approved: number; perHour: number | null }) {
  if (input.perHour == null || input.perHour < 1) return 0;
  return Math.min(input.approved, input.perHour);
}

export function nextAssessmentVersion(currentMax: number | null) {
  return (currentMax ?? 0) + 1;
}

export function mergeAssessments(previousIds: string[], insertedIds: string[]) {
  return { kept: previousIds.slice(), added: insertedIds.slice(), deleted: [] as string[] };
}

export function promotePassed<T extends RankedConversation>(item: T, rankedCount: number): T {
  return {
    ...item,
    worthTalkingAbout: true,
    passReason: null,
    lifecycle: "RANKED",
    rank: rankedCount + 1,
    nextStage: plannedNextStage({ ...item, worthTalkingAbout: true, lifecycle: "RANKED" }),
  };
}

export function settleIndependently<T, R>(items: T[], step: (item: T) => R) {
  const completed: R[] = [];
  const failed: Array<{ item: T; message: string }> = [];
  for (const item of items) {
    try {
      completed.push(step(item));
    } catch (error) {
      failed.push({ item, message: error instanceof Error ? error.message : "failed" });
    }
  }
  return { completed, failed };
}

export type PipelineCard = {
  id: string;
  conversationId: string | null;
  claimId: string | null;
  title: string;
  type: string;
  priority: string | null;
  research: string;
  timeliness: string | null;
  angle: string;
  reason: string;
  passReason: string | null;
  rank: number | null;
  lifecycle: string;
  discoveredAt: string | null;
  source: string;
  status: string;
  claimExtractionNeeded: boolean;
  version: number | null;
  scanId: string | null;
  pillar: string | null;
};

export function postShape(text: string, maximum = 280) {
  const count = Array.from(text).length;
  if (!text.trim()) return { count, shape: "Empty" as const };
  if (count <= maximum) return { count, shape: "Single post" as const };
  return { count, shape: "Long post" as const };
}
