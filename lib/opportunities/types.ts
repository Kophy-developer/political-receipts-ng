export const opportunityTypes = [
  "reaction",
  "opinion",
  "check",
  "analysis",
  "original_insight",
  "humour",
  "question",
] as const;

export type OpportunityType = (typeof opportunityTypes)[number];

export type ResearchNeed = "yes" | "recommended" | "no";

export type OpportunityScore = "high" | "medium" | "low";

export type OpportunityVoice = "fact" | "analysis" | "opinion" | "prediction" | "humour";

export type OpportunityStatus = "open" | "talk" | "ignored" | "research" | "saved";

export type OpportunityAngle = {
  title: string;
  note: string;
  questions: string[];
};

export type OpportunityCard = {
  id: string;
  conversationId: string | null;
  conversationTitle: string | null;
  type: string;
  research: string;
  score: string;
  scoreReason: string;
  whatHappened: string;
  whyInteresting: string;
  whatCouldAdd: string;
  angles: OpportunityAngle[];
  questions: string[];
  voice: string;
  status: string;
  editorAngle: string | null;
  editorTake: string | null;
  source: string;
  claimId: string | null;
};

export type OpportunityProposal = {
  type: OpportunityType;
  research: ResearchNeed;
  score: OpportunityScore;
  scoreReason: string;
  whatHappened: string;
  whyInteresting: string;
  whatCouldAdd: string;
  angles: OpportunityAngle[];
  questions: string[];
  voice: OpportunityVoice;
};
