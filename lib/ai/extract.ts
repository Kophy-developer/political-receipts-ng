import type { Relevance } from "@/lib/intel/relevance";

export const promptVersion = "claim-extract-v2";

export const extractionSchema = {
  type: "OBJECT",
  required: ["posts", "claims"],
  properties: {
    posts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["postId", "relevance"],
        properties: {
          postId: { type: "STRING" },
          relevance: { type: "STRING", enum: ["political", "possibly_political", "not_political"] },
        },
      },
    },
    claims: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["postId", "claim", "whyVerifiable", "evidenceNeeded", "confidence"],
        properties: {
          postId: { type: "STRING" },
          claim: { type: "STRING" },
          speaker: { type: "STRING" },
          topic: { type: "STRING" },
          entities: { type: "ARRAY", items: { type: "STRING" } },
          whyVerifiable: { type: "STRING" },
          evidenceNeeded: { type: "STRING" },
          confidence: { type: "STRING", enum: ["low", "moderate", "high"] },
        },
      },
    },
  },
} as const;

export const extractionSystem = `You extract checkable factual claims from public posts for a non-partisan Nigerian newsroom desk.

Rules:
- Use only the post text you are given.
- Do not invent sources, statistics, quotations, dates, or speakers.
- Do not use outside knowledge as evidence, and do not say a claim is true or false.
- Do not recommend a candidate, party, or vote, and do not say who a claim helps.
- Skip insults, slogans, jokes, preferences, predictions, and pure opinion.
- If you are unsure, omit the claim.
- A claim must be something a document, dataset, or official record could confirm or contradict.
- Every number and every quoted phrase in a claim must appear in that post.
- For posts marked uncertain, set relevance. Do not upgrade a post that has no political content in the text.
- Return JSON only.`;

export type ModelPost = {
  postId: string;
  relevance: Relevance;
};

export type ModelClaim = {
  postId: string;
  claim: string;
  speaker: string;
  topic: string;
  entities: string[];
  whyVerifiable: string;
  evidenceNeeded: string;
  confidence: "low" | "moderate" | "high";
};

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseExtraction(value: unknown) {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.posts) || !Array.isArray(record.claims)) return null;
  const posts: ModelPost[] = [];
  for (const item of record.posts) {
    const row = asRecord(item);
    if (!row || typeof row.postId !== "string") continue;
    if (row.relevance !== "political" && row.relevance !== "possibly_political" && row.relevance !== "not_political") continue;
    posts.push({ postId: row.postId, relevance: row.relevance });
  }
  const claims: ModelClaim[] = [];
  for (const item of record.claims) {
    const row = asRecord(item);
    if (!row || typeof row.postId !== "string" || typeof row.claim !== "string") continue;
    if (typeof row.whyVerifiable !== "string" || typeof row.evidenceNeeded !== "string") continue;
    if (row.confidence !== "low" && row.confidence !== "moderate" && row.confidence !== "high") continue;
    const entities = Array.isArray(row.entities) ? row.entities.filter((entity): entity is string => typeof entity === "string") : [];
    claims.push({
      postId: row.postId,
      claim: row.claim,
      speaker: typeof row.speaker === "string" ? row.speaker : "",
      topic: typeof row.topic === "string" ? row.topic : "",
      entities,
      whyVerifiable: row.whyVerifiable,
      evidenceNeeded: row.evidenceNeeded,
      confidence: row.confidence,
    });
  }
  return { posts, claims };
}

export function extractionUser(posts: Array<{ id: string; text: string; username: string | null; relevance: Relevance }>) {
  return JSON.stringify({
    instruction: "Extract claims only from these posts. Relevance is already a desk rule. You may mark an uncertain post not_political. You may not mark a post political unless its text supports that.",
    posts: posts.map((post) => ({
      id: post.id,
      username: post.username,
      rule: post.relevance,
      text: post.text.slice(0, 1200),
    })),
  });
}
