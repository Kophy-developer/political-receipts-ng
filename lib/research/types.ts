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

export type SourceCategory = {
  rank: number;
  name: string;
  notes: string;
  domains: string[];
};

export type ResearchPlan = {
  claimId: string;
  claim: string;
  pillar: Pillar;
  statementKind: StatementKind;
  claimTypes: ClaimType[];
  questions: string[];
  sourceCategories: SourceCategory[];
  maxSearchOperations: number;
  providerName: string;
  providerConfigured: boolean;
  credential: string | null;
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
