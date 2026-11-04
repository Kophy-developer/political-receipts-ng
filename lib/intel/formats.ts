import type { FormatDecision } from "@/lib/desk/types";
import type { ClaimStatus } from "@/lib/types";
import type { ConfidenceLabel, EvidenceStance } from "@/lib/desk/types";

export function editorialFormat(input: {
  status: ClaimStatus;
  confidence: ConfidenceLabel | null;
  hashtag: string | null;
  evidence: Array<{ stance: EvidenceStance }>;
}): FormatDecision {
  const contradicts = input.evidence.some((item) => item.stance === "contradicts");
  const supports = input.evidence.some((item) => item.stance === "supports");
  const notTrueAvailable = input.status === "Contradicted" && contradicts && input.confidence === "High";
  const notTrueReason = notTrueAvailable
    ? "Collected evidence contradicts the claim and the editor’s verification confidence is high."
    : "Not available. #NotTrue waits for collected evidence that contradicts the claim at high confidence.";

  let current: FormatDecision["current"] = "Unverified";
  if (notTrueAvailable) current = "#NotTrue";
  else if (input.status === "Needs Context") current = "Needs Context";
  else if (input.status === "Verified" && supports && input.hashtag === "#ShowYourWorking") current = "#ShowYourWorking";
  else if (input.status === "Verified" && supports) current = "#CheckAm";
  else if (input.evidence.length > 0 && input.status !== "Unverified" && input.status !== "New" && input.status !== "Researching") {
    current = "Needs Context";
  }

  return { current, notTrueAvailable, notTrueReason };
}
