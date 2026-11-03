import type { ClaimStatus, Classification, SourceTier } from "@/lib/types";
import type { ConfidenceLabel, EvidenceStance } from "@/lib/desk/types";

const statusFromDb: Record<string, ClaimStatus> = {
  new: "New",
  researching: "Researching",
  verified: "Verified",
  contradicted: "Contradicted",
  needs_context: "Needs Context",
  unverified: "Unverified",
};

const statusToDb: Record<ClaimStatus, string> = {
  New: "new",
  Researching: "researching",
  Verified: "verified",
  Contradicted: "contradicted",
  "Needs Context": "needs_context",
  Unverified: "unverified",
};

const confidenceFromDb: Record<string, ConfidenceLabel> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
};

const tierFromCategory: Record<string, SourceTier> = {
  "Primary Government Source": "Primary Government Source",
  "Official Statistics": "Official Statistics",
  "Legislation/Court Record": "Legislation/Court Record",
  "Established News Organization": "Established News Organization",
  "Independent Fact Checker": "Independent Fact Checker",
  "Other Source": "Other Source",
};

export function claimStatusLabel(value: string): ClaimStatus {
  return statusFromDb[value] ?? "New";
}

export function claimStatusValue(value: ClaimStatus) {
  return statusToDb[value];
}

export function classificationFor(status: ClaimStatus): Classification | null {
  if (status === "Verified") return "VERIFIED";
  if (status === "Contradicted") return "CONTRADICTED";
  if (status === "Needs Context") return "NEEDS CONTEXT";
  if (status === "Unverified") return "UNVERIFIED";
  return null;
}

export function confidenceLabel(value: string | null): ConfidenceLabel | null {
  if (!value) return null;
  return confidenceFromDb[value] ?? null;
}

export function sourceTier(category: string): SourceTier {
  return tierFromCategory[category] ?? "Other Source";
}

export function stanceLabel(value: string): EvidenceStance {
  if (value === "supports" || value === "contradicts" || value === "contextualizes") return value;
  return "contextualizes";
}

export function styleIntent(style: string) {
  if (style === "straight") return "Straight factual.";
  if (style === "conversational") return "Conversational.";
  if (style === "strong_hook") return "Strong hook.";
  return style;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
