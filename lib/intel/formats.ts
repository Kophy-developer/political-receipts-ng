import type { FormatDecision } from "@/lib/desk/types";
import type { ClaimStatus } from "@/lib/types";
import type { ConfidenceLabel, EvidenceStance } from "@/lib/desk/types";

export function editorialFormat(input: {
  status: ClaimStatus;
  confidence: ConfidenceLabel | null;
  hashtag: string | null;
  evidence: Array<{ stance: EvidenceStance; review?: "proposed" | "accepted" | "rejected" }>;
  statementKind?: "fact" | "analysis" | "opinion" | null;
  workingNotes?: string | null;
}): FormatDecision {
  const accepted = input.evidence.filter((item) => item.review === "accepted" || item.review === undefined);
  const contradicts = accepted.some((item) => item.stance === "contradicts");
  const supports = accepted.some((item) => item.stance === "supports");
  const opinion = input.statementKind === "opinion";
  const notTrueAvailable = !opinion && input.status === "Contradicted" && contradicts && input.confidence === "High";
  const notTrueReason = opinion
    ? "Not available. #NotTrue is for a factual claim the evidence contradicts. It is not for disagreeing with an opinion."
    : notTrueAvailable
      ? "Accepted evidence contradicts the factual claim, and the recorded confidence is high."
      : "Not available. #NotTrue waits for accepted evidence that contradicts a factual claim at high confidence.";

  let current: FormatDecision["current"] = "Unverified";
  if (notTrueAvailable) current = "#NotTrue";
  else if (input.workingNotes || input.hashtag === "#ShowYourWorking") current = "#ShowYourWorking";
  else if (input.status === "Needs Context") current = "Needs Context";
  else if (input.status === "Verified" && supports) current = "#CheckAm";
  else if (accepted.length > 0 && input.status !== "Unverified" && input.status !== "New" && input.status !== "Researching") {
    current = "Needs Context";
  }

  return { current, notTrueAvailable, notTrueReason };
}
