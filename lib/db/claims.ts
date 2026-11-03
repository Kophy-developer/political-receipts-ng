import "server-only";
import { lagosStamp } from "@/lib/format";
import type { DeskClaim, DeskClaimSummary, DeskEvidence } from "@/lib/desk/types";
import { schemaMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";
import { claimStatusLabel, classificationFor, confidenceLabel, sourceTier, stanceLabel } from "@/lib/db/labels";

type EvidenceRow = {
  id: string;
  excerpt: string;
  stance: string;
  editor_notes: string | null;
  sources:
    | {
        organization: string;
        title: string;
        url: string | null;
        published_label: string | null;
        published_on: string | null;
        category: string;
        reliability: string;
      }
    | {
        organization: string;
        title: string;
        url: string | null;
        published_label: string | null;
        published_on: string | null;
        category: string;
        reliability: string;
      }[]
    | null;
};

type ClaimRow = {
  id: string;
  claim_text: string;
  original_author: string | null;
  original_author_username: string | null;
  original_author_role: string | null;
  original_post_text: string | null;
  original_post_url: string | null;
  detected_at: string | null;
  engagement: Record<string, unknown> | null;
  status: string;
  verification_confidence: string | null;
  editor_notes: string | null;
  suggested_hashtag: string | null;
  origin: "demo" | "live";
  topics: { name: string } | { name: string }[] | null;
  evidence: EvidenceRow[] | null;
  drafts: { id: string; status: string }[] | null;
};

const claimSelect = `
  id, claim_text, original_author, original_author_username, original_author_role,
  original_post_text, original_post_url, detected_at, engagement, status,
  verification_confidence, editor_notes, suggested_hashtag, origin,
  topics ( name ),
  evidence ( id, excerpt, stance, editor_notes, sources ( organization, title, url, published_label, published_on, category, reliability ) ),
  drafts ( id, status )
`;

function textEngagement(value: Record<string, unknown> | null) {
  if (!value) return null;
  const read = (key: string) => (typeof value[key] === "string" || typeof value[key] === "number" ? String(value[key]) : null);
  const replies = read("replies");
  const reposts = read("reposts");
  const likes = read("likes");
  const views = read("views");
  if (!replies && !reposts && !likes && !views) return null;
  return {
    replies: replies ?? "—",
    reposts: reposts ?? "—",
    likes: likes ?? "—",
    views: views ?? "—",
  };
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function evidenceOf(rows: EvidenceRow[] | null): DeskEvidence[] {
  return (rows ?? []).flatMap((row) => {
    const source = one(row.sources);
    if (!source) return [];
    return [
      {
        id: row.id,
        organization: source.organization,
        title: source.title,
        url: source.url && source.url.startsWith("https://") ? source.url : null,
        published: source.published_label || source.published_on || "Date not recorded",
        excerpt: row.excerpt,
        category: source.category,
        tier: sourceTier(source.category),
        reliability: source.reliability,
        stance: stanceLabel(row.stance),
        notes: row.editor_notes,
      },
    ];
  });
}

function summary(row: ClaimRow): DeskClaimSummary {
  const status = claimStatusLabel(row.status);
  const virality = row.engagement && typeof row.engagement.virality === "string" ? row.engagement.virality : null;
  return {
    id: row.id,
    claim: row.claim_text,
    speaker: row.original_author || "Unknown author",
    handle: row.original_author_username ? `@${row.original_author_username.replace(/^@/, "")}` : "—",
    postedAt: lagosStamp(row.detected_at),
    topic: one(row.topics)?.name || "Unsorted",
    status,
    confidence: confidenceLabel(row.verification_confidence),
    virality,
    evidenceCount: row.evidence?.length ?? 0,
    origin: row.origin,
  };
}

export function toClaim(row: ClaimRow): DeskClaim {
  const base = summary(row);
  const drafts = row.drafts ?? [];
  return {
    ...base,
    role: row.original_author_role || "Not recorded",
    postText: row.original_post_text || "The original post text has not been filed.",
    postUrl: row.original_post_url && row.original_post_url.startsWith("https://") ? row.original_post_url : null,
    notes: row.editor_notes,
    hashtag: row.suggested_hashtag,
    classification: classificationFor(base.status),
    engagement: textEngagement(row.engagement),
    evidence: evidenceOf(row.evidence),
    draftReady: drafts.some((draft) => draft.status === "ready" || draft.status === "edited"),
  };
}

export async function listClaims() {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const };
  const { data, error } = await db.from("claims").select(claimSelect).order("detected_at", { ascending: false });
  if (error) return { ok: false as const, reason: schemaMissing(error.message) ? ("schema" as const) : ("unreachable" as const), message: scrubDbMessage(error.message) };
  const claims = ((data ?? []) as unknown as ClaimRow[]).map(toClaim);
  return { ok: true as const, claims };
}

export async function getClaim(id: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const };
  const { data, error } = await db.from("claims").select(claimSelect).eq("id", id).maybeSingle();
  if (error) return { ok: false as const, reason: schemaMissing(error.message) ? ("schema" as const) : ("unreachable" as const) };
  if (!data) return { ok: true as const, claim: null };
  return { ok: true as const, claim: toClaim(data as unknown as ClaimRow) };
}

export async function createClaim(input: {
  claimText: string;
  topicId?: string | null;
  conversationId?: string | null;
  author?: string | null;
  username?: string | null;
  postId?: string | null;
  postUrl?: string | null;
  postText?: string | null;
  detectedAt?: string | null;
  origin?: "demo" | "live";
  actor: string;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const { data, error } = await db
    .from("claims")
    .insert({
      claim_text: input.claimText,
      topic_id: input.topicId ?? null,
      conversation_id: input.conversationId ?? null,
      original_author: input.author ?? null,
      original_author_username: input.username ?? null,
      original_post_id: input.postId ?? null,
      original_post_url: input.postUrl ?? null,
      original_post_text: input.postText ?? null,
      detected_at: input.detectedAt ?? new Date().toISOString(),
      origin: input.origin ?? "live",
      status: "new",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, message: scrubDbMessage(error?.message || "insert") };
  await recordEvent({ action: "claim created", actor: input.actor, subjectType: "claim", subjectId: data.id, detail: { origin: input.origin ?? "live" } });
  return { ok: true as const, id: data.id as string };
}
