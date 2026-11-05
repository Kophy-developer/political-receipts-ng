import type { Relevance } from "@/lib/intel/relevance";

export const promptVersion = "claim-extract-v3";

export const extractionSchema = {
  type: "OBJECT",
  required: ["claims"],
  properties: {
    claims: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["postId", "claim", "why", "needed", "confidence"],
        properties: {
          postId: { type: "STRING" },
          claim: { type: "STRING" },
          why: { type: "STRING" },
          needed: { type: "STRING" },
          confidence: { type: "STRING", enum: ["low", "moderate", "high"] },
        },
      },
    },
  },
} as const;

export const extractionSystem = `Extract checkable claims from the posts you are given. Use only those posts. Do not invent numbers, quotations, dates, or speakers. Omit opinions, slogans, jokes, and predictions. If nothing is checkable, return {"claims":[]}.

Return JSON only.
Do not use markdown.
Do not include commentary outside the object.

Each claim is one short sentence. why and needed are one short sentence each.
Use the post id you were given. Do not repeat the post text.
Shape: {"claims":[{"postId":"","claim":"","why":"","needed":"","confidence":"low"}]}
confidence is low, moderate, or high.`;

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
  if (!record || !Array.isArray(record.claims)) return null;
  const posts: ModelPost[] = [];
  if (Array.isArray(record.posts)) {
    for (const item of record.posts) {
      const row = asRecord(item);
      if (!row || typeof row.postId !== "string") continue;
      if (row.relevance !== "political" && row.relevance !== "possibly_political" && row.relevance !== "not_political") continue;
      posts.push({ postId: row.postId, relevance: row.relevance });
    }
  }
  const claims: ModelClaim[] = [];
  for (const item of record.claims) {
    const row = asRecord(item);
    const why = typeof row?.why === "string" ? row.why : typeof row?.whyVerifiable === "string" ? row.whyVerifiable : null;
    const needed = typeof row?.needed === "string" ? row.needed : typeof row?.evidenceNeeded === "string" ? row.evidenceNeeded : null;
    if (!row || typeof row.postId !== "string" || typeof row.claim !== "string" || !why || !needed) continue;
    if (row.confidence !== "low" && row.confidence !== "moderate" && row.confidence !== "high") continue;
    const entities = Array.isArray(row.entities) ? row.entities.filter((entity): entity is string => typeof entity === "string") : [];
    claims.push({
      postId: row.postId,
      claim: row.claim,
      speaker: typeof row.speaker === "string" ? row.speaker : "",
      topic: typeof row.topic === "string" ? row.topic : "",
      entities,
      whyVerifiable: why,
      evidenceNeeded: needed,
      confidence: row.confidence,
    });
  }
  if (record.claims.length > 0 && claims.length === 0) return null;
  return { posts, claims };
}

export function extractionUser(posts: Array<{ id: string; text: string; username: string | null; relevance: Relevance }>) {
  return JSON.stringify({
    posts: posts.map((post) => ({
      id: post.id,
      text: post.text.slice(0, 700),
    })),
  });
}
