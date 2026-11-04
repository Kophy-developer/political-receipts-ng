import type { ClaimStatus, Classification, SourceTier } from "@/lib/types";

export type RecordOrigin = "demo" | "live";

export type DeskMode = "unconfigured" | "unreachable" | "empty" | "demo" | "live" | "mixed";

export type ConfidenceLabel = "Low" | "Moderate" | "High";

export type ImportanceLabel = "High" | "Medium" | "Low";

export type FormatName = "Unverified" | "Needs Context" | "#CheckAm" | "#ShowYourWorking" | "#NotTrue";

export type FormatDecision = {
  current: FormatName;
  notTrueAvailable: boolean;
  notTrueReason: string;
};

export type RelatedPost = {
  id: string;
  username: string | null;
  text: string;
  url: string;
  postedAt: string;
};

export type EvidenceStance = "supports" | "contradicts" | "contextualizes";

export type DeskClaimSummary = {
  id: string;
  claim: string;
  speaker: string;
  handle: string;
  postedAt: string;
  topic: string;
  status: ClaimStatus;
  confidence: ConfidenceLabel | null;
  virality: string | null;
  evidenceCount: number;
  origin: RecordOrigin;
  importance: ImportanceLabel | null;
  entities: string[];
  conversationSize: number | null;
};

export type DeskEvidence = {
  id: string;
  organization: string;
  title: string;
  url: string | null;
  published: string;
  excerpt: string;
  category: string;
  tier: SourceTier;
  reliability: string;
  stance: EvidenceStance;
  notes: string | null;
};

export type DeskClaim = DeskClaimSummary & {
  role: string;
  postText: string;
  postUrl: string | null;
  notes: string | null;
  hashtag: string | null;
  classification: Classification | null;
  engagement: { replies: string; reposts: string; likes: string; views: string } | null;
  evidence: DeskEvidence[];
  draftReady: boolean;
  importanceReason: string | null;
  verifiability: string | null;
  evidenceNeeded: string | null;
  aiConfidence: ConfidenceLabel | null;
  relatedPosts: RelatedPost[];
  format: FormatDecision;
};

export type DeskClassName = "actionable" | "discussion" | "noise";

export type AttentionLabel = "Emerging" | "Growing" | "High attention";

export type DeskConversation = {
  id: string;
  title: string;
  topic: string;
  attention: AttentionLabel | null;
  deskClass: DeskClassName | null;
  summary: string;
  narrative: string[];
  volume: number | null;
  growthPct: number | null;
  velocity: "Normal" | "Growing" | "Rapid" | "Breaking" | null;
  velocityNote: string | null;
  firstDetected: string;
  entities: string[];
  relatedClaims: Array<{ id: string; claim: string; status: ClaimStatus }>;
  deskNote: string | null;
  origin: RecordOrigin;
  postCount: number | null;
};

export type StudioVersion = {
  id: "A" | "B" | "C";
  draftId: string;
  label: string;
  intent: string;
  text: string;
  hashtag: string;
  style: string;
  status: string;
  editorModified: boolean;
};

export type StudioPackage = {
  claimId: string;
  ready: boolean;
  holdReason: string | null;
  origin: RecordOrigin;
  versions: StudioVersion[];
};

export type StudioClaim = {
  id: string;
  claim: string;
  handle: string;
  topic: string;
  status: ClaimStatus;
  confidence: ConfidenceLabel | null;
  classification: Classification | null;
  evidenceOrgs: string[];
  origin: RecordOrigin;
  note: string;
};

export type DeskPost = {
  id: string;
  text: string;
  url: string | null;
  publishedAt: string;
  account: string;
  hashtag: string | null;
  topic: string;
  style: string | null;
  classification: Classification | null;
  origin: RecordOrigin;
};

export type FiledSource = {
  id: string;
  organization: string;
  title: string;
  url: string | null;
  published: string;
  category: string;
  tier: SourceTier;
  reliability: string;
  retrievedAt: string;
  origin: RecordOrigin;
};

export type UsageView = {
  installed: boolean;
  dayLabel: string;
  xRequests: number;
  xRequestLimit: number;
  posts: number;
  postLimit: number;
  geminiRequests: number;
  geminiLimit: number;
  inputTokens: number | null;
  outputTokens: number | null;
  lastDuration: string | null;
  groups: number;
  perScanPosts: number;
  perScanRequests: number;
  lookbackHours: number;
  minEngagement: number;
  estimatedXSpendToday: string;
  estimatedXSpendAll: string;
  spendLabel: "ESTIMATED";
  spendNote: string;
};

export type ResearchCard = {
  id: string;
  claim: string;
  speaker: string;
  handle: string;
  postUrl: string | null;
  topic: string;
  entities: string[];
  conversationSize: number;
  engagement: number;
  importance: ImportanceLabel;
  importanceReason: string;
  status: ClaimStatus;
  aiConfidence: ConfidenceLabel | null;
  origin: RecordOrigin;
  deskClass: DeskClassName | null;
};

export type DeskSnapshot = {
  mode: DeskMode;
  counts: {
    claims: number;
    conversations: number;
    draftsReady: number;
    published: number;
  };
  moving: DeskConversation[];
  queue: DeskClaimSummary[];
  ready: Array<{ claimId: string; claim: string; origin: RecordOrigin }>;
  latest: DeskPost[];
};

export type SystemHealth = {
  supabaseConfigured: boolean;
  databaseReachable: boolean;
  schema: "present" | "missing" | "unknown";
  missingTables: string[];
  xCredentials: boolean;
  xOauth2: boolean;
  xOauth1: boolean;
  encryptionKey: boolean;
  xAccount: {
    status: string;
    username: string | null;
    displayName: string | null;
    lastVerified: string | null;
  };
  ai: "Claim extraction" | "Not configured";
  model: string | null;
  monitoring: "Manual only";
};
