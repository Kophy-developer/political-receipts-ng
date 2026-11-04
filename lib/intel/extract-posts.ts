import "server-only";
import { aiProvider } from "@/lib/ai/provider";
import { extractionSystem, extractionUser, parseExtraction, promptVersion } from "@/lib/ai/extract";
import { saveAnalysis } from "@/lib/db/intel";
import { recordUsage } from "@/lib/db/usage";
import type { WorkingPost } from "@/lib/intel/posts";
import { extractionLabel, type ExtractionOutcome } from "@/lib/intel/outcome";
import { cleanModelNote, groundedClaim, groundedSpeaker, looksCheckable, sanitizeText } from "@/lib/intel/text";

export type AcceptedClaim = {
  post: WorkingPost;
  claim: string;
  speaker: string;
  role: string;
  entities: string[];
  why: string;
  needed: string;
  confidence: "low" | "moderate" | "high";
};

export type ExtractionReport = {
  outcome: ExtractionOutcome;
  detail: string;
  claims: AcceptedClaim[];
  dropped: number;
  geminiRequests: number;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
};

function tally(reasons: string[]) {
  const counts = new Map<string, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts.entries()].map(([reason, count]) => `${count} ${reason}`).join(", ");
}

export async function extractFromPosts(posts: WorkingPost[], scanId: string | null): Promise<ExtractionReport> {
  const empty = (outcome: ExtractionOutcome, detail: string, extra?: Partial<ExtractionReport>): ExtractionReport => ({
    outcome,
    detail,
    claims: [],
    dropped: 0,
    geminiRequests: 0,
    inputTokens: null,
    outputTokens: null,
    model: null,
    ...extra,
  });
  const candidates = posts.filter((post) => post.deskClass !== "noise" && post.relevance !== "not_political");
  if (candidates.length === 0) {
    return empty("not_run", "No actionable or discussion post was sent to the model.");
  }
  const provider = aiProvider();
  if (!provider) return empty("failed", "AI extraction failed: Gemini is not configured.");
  const completion = await provider.completeJson({
    promptVersion,
    system: extractionSystem,
    user: extractionUser(
      candidates.map((post) => ({
        id: post.id,
        text: post.text,
        username: post.username,
        relevance: post.relevance,
      })),
    ),
  });
  await recordUsage({
    provider: "gemini",
    operation: "claim_extract",
    requests: 1,
    units: candidates.length,
    inputTokens: completion.usage.inputTokens,
    outputTokens: completion.usage.outputTokens,
    scanId,
  });
  await saveAnalysis({ provider: completion.provider, model: completion.model, promptVersion, scanId: scanId ?? undefined });
  const base = {
    geminiRequests: 1,
    inputTokens: completion.usage.inputTokens,
    outputTokens: completion.usage.outputTokens,
    model: completion.model,
  };
  if (!completion.ok) {
    const invalid = /json/i.test(completion.message);
    const outcome: ExtractionOutcome = invalid ? "invalid" : "failed";
    const prefix = extractionLabel(outcome);
    return empty(outcome, `${prefix}: ${completion.message}`, base);
  }
  const parsed = parseExtraction(completion.data);
  if (!parsed) return empty("invalid", "AI response was invalid: the JSON did not match the claim schema.", base);
  if (parsed.claims.length === 0) return empty("no_claims", "No checkable claims existed.", base);
  const byId = new Map(posts.map((post) => [post.id, post]));
  const accepted: AcceptedClaim[] = [];
  const reasons: string[] = [];
  for (const row of parsed.claims) {
    if (accepted.length >= 8) {
      reasons.push("over the cap");
      continue;
    }
    const post = byId.get(row.postId);
    const claim = sanitizeText(row.claim, 400);
    const why = post ? cleanModelNote(row.whyVerifiable, post.text) : null;
    const needed = post ? cleanModelNote(row.evidenceNeeded, post.text) : null;
    if (!post) reasons.push("unknown post");
    else if (post.deskClass === "noise" || post.relevance === "not_political") reasons.push("noise");
    else if (!why || !needed) reasons.push("missing note");
    else if (!looksCheckable(claim)) reasons.push("not checkable");
    else if (!groundedClaim(claim, post.text)) reasons.push("not grounded");
    else {
      const speaker = groundedSpeaker(row.speaker, post.text, post.displayName, post.username);
      accepted.push({
        post,
        claim,
        speaker: speaker ?? post.displayName ?? "Unknown account",
        role: speaker ? "Named in the post" : "Account that posted it",
        entities: Array.from(
          new Set(
            row.entities
              .map((entity) => sanitizeText(entity, 60))
              .filter((entity) => entity && post.text.toLowerCase().includes(entity.toLowerCase())),
          ),
        ).slice(0, 8),
        why,
        needed,
        confidence: row.confidence,
      });
    }
  }
  if (accepted.length === 0) {
    return empty("rejected", `Claims were rejected by validation (${tally(reasons) || "none usable"}).`, { ...base, dropped: reasons.length });
  }
  return {
    outcome: "extracted",
    detail: reasons.length ? `Claims extracted. ${tally(reasons)} were rejected by validation.` : "Claims extracted.",
    claims: accepted,
    dropped: reasons.length,
    ...base,
  };
}
