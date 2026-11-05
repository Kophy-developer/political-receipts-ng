import { scanBudget } from "@/lib/intel/budget";
import { nextAction, type StoryFacts } from "@/lib/desk/story";

export const discoveryActions = ["REACT", "INVESTIGATE", "REVIEW EVIDENCE", "CHOOSE ANGLE", "WRITE POST"] as const;

export type DiscoveryAction = (typeof discoveryActions)[number];

export const scanConfirmation = {
  scope: "Nigerian politics/public affairs",
  search: "Controlled recent-search scan",
  maximumPosts: scanBudget.maxPostsPerScan,
  estimatedRequests: scanBudget.maxXRequestsPerScan,
} as const;

export type ScanCounts = {
  postsReturned: number;
  conversations: number;
  claims: number;
};

export function scanDeskSummary(report: ScanCounts) {
  return {
    posts: `${report.postsReturned} ${report.postsReturned === 1 ? "post" : "posts"} reviewed`,
    conversations: `${report.conversations} new ${report.conversations === 1 ? "conversation" : "conversations"}`,
    opportunities: `${report.claims} ${report.claims === 1 ? "opportunity" : "opportunities"} found`,
  };
}

const fromStory: Record<Exclude<ReturnType<typeof nextAction>, null>, DiscoveryAction> = {
  INVESTIGATE: "INVESTIGATE",
  "REVIEW EVIDENCE": "REVIEW EVIDENCE",
  "CHOOSE VERDICT": "CHOOSE ANGLE",
  "WRITE POST": "WRITE POST",
  "REVIEW POST": "WRITE POST",
  PUBLISH: "WRITE POST",
};

export function discoveryAction(input: {
  type: string;
  research: string;
  status: string;
  editorAngle: string | null;
  editorTake: string | null;
  claim: { published: boolean; facts: StoryFacts } | null;
}): DiscoveryAction | null {
  if (input.status === "ignored") return null;
  if (input.claim?.published) return null;
  if (input.claim) {
    const action = nextAction(input.claim.facts);
    return action ? fromStory[action] : null;
  }
  if (input.research === "yes" || input.research === "recommended" || input.status === "research" || input.type === "check") {
    return "INVESTIGATE";
  }
  if (input.status === "talk" || input.editorAngle || input.editorTake) return "WRITE POST";
  return "REACT";
}

export function freshClaimAction(): DiscoveryAction {
  const action = nextAction({
    hasConversation: true,
    acceptedEvidence: 0,
    verdictRecorded: false,
    angleChosen: false,
    finalText: "",
    published: false,
  });
  return action ? fromStory[action] : "INVESTIGATE";
}

export type RankedOpportunity = {
  id: string;
  score: string;
  status: string;
  claimId: string | null;
};

const scoreOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Best open opportunities that are not already a Desk story. */
export function selectDeskOpportunities<T extends RankedOpportunity>(items: T[], storyClaimIds: ReadonlySet<string>) {
  return items
    .filter((item) => item.status !== "ignored" && item.status !== "saved")
    .filter((item) => item.score === "high" || item.score === "medium")
    .filter((item) => !item.claimId || !storyClaimIds.has(item.claimId))
    .sort((left, right) => (scoreOrder[left.score] ?? 9) - (scoreOrder[right.score] ?? 9))
    .slice(0, 5);
}
