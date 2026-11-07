export type Pillar = "politics" | "football" | "finance";

export type StatementKind = "fact" | "analysis" | "opinion";

export type ClaimType =
  | "quotation"
  | "economic statistic"
  | "government spending"
  | "budget/public finance"
  | "election rule/process"
  | "election result"
  | "legislative/voting record"
  | "government policy"
  | "political appointment"
  | "court/legal claim"
  | "security statistic"
  | "historical claim"
  | "public-office record"
  | "match fact"
  | "football opinion"
  | "market fact"
  | "financial analysis"
  | "other verifiable factual claim";

export type ProposedVerdict =
  | "SUPPORTED"
  | "CONTRADICTED"
  | "MISLEADING"
  | "NEEDS CONTEXT"
  | "UNVERIFIED"
  | "INSUFFICIENT EVIDENCE";

export type ResearchQuestion = {
  question: string;
  primary: string;
};

export type SearchStage = "primary" | "independent" | "context";

export type ResearchProblem = "record" | "allegation" | "attribution" | "general";

export type EvidenceQualityLabel = "PRIMARY RECORD" | "STRONG SECONDARY" | "CONTEXT ONLY" | "INSUFFICIENT";

export type SourceCategory = {
  rank: number;
  name: string;
  notes: string;
  domains: string[];
};

export type PlannedQuestion = {
  problem: ResearchProblem;
  question: string;
  authority: string;
};

export type PlannedSearch = {
  problem: ResearchProblem;
  question: string;
  authority: string;
  domains: string[];
  query: string;
  stage: SearchStage;
  stageLabel: string;
};

export type StoredResearchPlan = {
  version: 1;
  /** Set only on an upgraded continuation. Absent on plans hashed before Phase 2 resumption. */
  planner?: string;
  claim: string;
  stage: SearchStage;
  cursor: number;
  awaitingReview: boolean;
  authority: string;
  domains: string[];
  providerId: "tavily" | "brave";
  questions: PlannedQuestion[];
  variants: Array<{ problem: ResearchProblem; question: string; query: string }>;
  searches: PlannedSearch[];
  direct: {
    domains: string[];
    terms: string[];
    maxEntryPages: number;
    maxFollowedLinks: number;
  };
};

export type ResearchPlan = {
  claimId: string;
  claim: string;
  pillar: Pillar;
  statementKind: StatementKind;
  claimTypes: ClaimType[];
  questions: PlannedQuestion[];
  searches: PlannedSearch[];
  sourceCategories: SourceCategory[];
  stage: SearchStage;
  stageLabel: string;
  authority: string;
  domains: string[];
  maxSearchOperations: number;
  maxDocumentOperations: number;
  providerName: string;
  providerId: "tavily" | "brave";
  providerConfigured: boolean;
  credential: string | null;
  hash: string;
  awaitingReview: boolean;
  alreadyRun: boolean;
  outcome: "PRIMARY SOURCE FOUND" | "PRIMARY SOURCE NOT FOUND" | null;
  nextStage: SearchStage | null;
  quality: { label: EvidenceQualityLabel; reason: string };
  problems: Array<{ question: string; label: EvidenceQualityLabel; reason: string }>;
  directNote: string;
  outside: Array<{ url: string; reason: string }>;
};

export type RetrievedDocument = {
  url: string;
  domain: string;
  organization: string;
  title: string;
  published: string | null;
  retrievedAt: string;
  tierRank: number;
  tierName: string;
  passage: string;
  reliabilityNotes: string;
};
