export type ExtractionOutcome = "not_run" | "failed" | "invalid" | "no_claims" | "rejected" | "extracted";

export function extractionLabel(outcome: ExtractionOutcome) {
  if (outcome === "failed") return "AI extraction failed";
  if (outcome === "invalid") return "AI response was invalid";
  if (outcome === "no_claims") return "No checkable claims existed";
  if (outcome === "rejected") return "Claims were rejected by validation";
  if (outcome === "extracted") return "Claims extracted";
  return "Extraction did not run";
}
