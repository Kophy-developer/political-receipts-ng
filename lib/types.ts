export type Velocity = "Normal" | "Growing" | "Rapid" | "Breaking";

export type ClaimStatus =
  | "New"
  | "Researching"
  | "Verified"
  | "Contradicted"
  | "Needs Context"
  | "Unverified";

export type Classification =
  | "VERIFIED"
  | "CONTRADICTED"
  | "NEEDS CONTEXT"
  | "UNVERIFIED";

export type SourceTier =
  | "Primary Government Source"
  | "Official Statistics"
  | "Legislation/Court Record"
  | "Established News Organization"
  | "Independent Fact Checker"
  | "Other Source";

export type Reliability = "High" | "Substantial" | "Moderate" | "Low";

export type Virality = "Low" | "Moderate" | "High" | "Extreme";

export type Hashtag = "#CheckAm" | "#ShowYourWorking" | "#NotTrue";

export type Risk = "Low" | "Moderate" | "Elevated";

export type VersionId = "A" | "B" | "C";

export interface Conversation {
  id: string;
  topic: string;
  summary: string;
  narrative: string[];
  volume: number;
  growthPct: number;
  velocity: Velocity;
  velocityNote: string;
  firstDetected: string;
  entities: string[];
  confidence: number;
  relatedClaimIds: string[];
  series: number[];
  regions: { name: string; share: number }[];
  deskNote: string;
}

export interface Evidence {
  id: string;
  organization: string;
  title: string;
  published: string;
  urlPlaceholder: string;
  excerpt: string;
  sourceType: string;
  tier: SourceTier;
  reliability: Reliability;
}

export interface FactCheck {
  known: string[];
  supports: string[];
  uncertain: string[];
  classification: Classification | null;
  note: string;
  hashtag: Hashtag | null;
  hashtagReason: string;
}

export interface Claim {
  id: string;
  claim: string;
  speaker: string;
  handle: string;
  role: string;
  postText: string;
  postedAt: string;
  topic: string;
  topicId: string;
  virality: Virality;
  viralityScore: number;
  status: ClaimStatus;
  confidence: number | null;
  evidence: Evidence[];
  factCheck: FactCheck;
  engagement: {
    replies: string;
    reposts: string;
    likes: string;
    views: string;
  };
}

export interface DraftVersion {
  id: VersionId;
  label: string;
  intent: string;
  text: string;
  alternates: string[];
  hashtag: Hashtag;
  confidence: number;
  risk: Risk;
  riskNote: string;
}

export interface DraftPackage {
  claimId: string;
  ready: boolean;
  holdReason: string | null;
  versions: DraftVersion[];
}

export interface PublishedPost {
  id: string;
  publishedAt: string;
  hour: number;
  text: string;
  hashtag: Hashtag;
  format: "CheckAm" | "ShowYourWorking" | "NotTrue";
  hook: "Straight" | "Conversational" | "Strong hook";
  mode: "Data-driven" | "Plain commentary";
  topic: string;
  impressions: number;
  engagements: number;
  bookmarks: number;
  reposts: number;
  replies: number;
  profileVisits: number;
  follows: number;
  classification: Classification;
}

export interface SourceRecord {
  id: string;
  name: string;
  category: string;
  tier: SourceTier;
  cadence: string;
  use: string;
  examples: string[];
  caution: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
}
