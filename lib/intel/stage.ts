import { providerLabels, type ProviderId } from "@/lib/ai/catalog";

export const scanStages = ["X_RETRIEVAL_COMPLETE", "AI_PROCESSING", "COMPLETE", "PARTIAL_FAILURE"] as const;

export type ScanStage = (typeof scanStages)[number];

export function scanNeedsReprocess(input: { stage: string | null; status: string; postsStored: number; claims: number }) {
  if (input.postsStored < 1) return false;
  if (input.stage === "COMPLETE") return false;
  if (input.stage === "PARTIAL_FAILURE") return true;
  return input.status === "stopped" && input.claims === 0;
}

export function analysisFailureReason(error: string | null) {
  if (!error) return "The analysis did not finish";
  if (/did not answer in time|timed out|timeout/i.test(error)) return "Timed out";
  if (/output budget|output_token_limit/i.test(error)) return "The output budget was used up";
  if (/rate limit/i.test(error)) return "Rate limited";
  if (/json|could not be read|invalid_response/i.test(error)) return "The response could not be read";
  return "The analysis did not finish";
}

export function providerDisplay(provider: string | null) {
  if (provider === "groq" || provider === "openrouter" || provider === "gemini") return providerLabels[provider];
  return "Not recorded";
}

export type OpportunityWrite = "insert" | "update" | "keep";

export function extractionOpportunityWrite(existing: { status: string; editorTake: string | null } | null): OpportunityWrite {
  if (!existing) return "insert";
  if (existing.editorTake || existing.status === "ignored" || existing.status === "research" || existing.status === "talk" || existing.status === "saved") {
    return "keep";
  }
  return "update";
}

export function reprocessSummary(input: { posts: number; conversations: number; opportunities: number }) {
  const opportunities = `${input.opportunities} ${input.opportunities === 1 ? "opportunity" : "opportunities"} found`;
  return {
    posts: `${input.posts} posts reviewed`,
    conversations: `${input.conversations} ${input.conversations === 1 ? "conversation" : "conversations"}`,
    opportunities,
  };
}

export function isProviderId(value: string | null | undefined): value is ProviderId {
  return value === "groq" || value === "openrouter" || value === "gemini";
}
