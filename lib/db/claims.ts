import "server-only";
import { lagosStamp } from "@/lib/format";
import type { DeskClaim, DeskClaimSummary, DeskEvidence } from "@/lib/desk/types";
import type { FormatDecision, ImportanceLabel, RelatedPost } from "@/lib/desk/types";
import { columnMissing, schemaMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";
import { claimStatusLabel, classificationFor, confidenceLabel, sourceTier, stanceLabel } from "@/lib/db/labels";
import { editorialFormat } from "@/lib/intel/formats";
import { publicPostUrl } from "@/lib/intel/text";
import { parseEditorReview, parseRecordedSources, type ReviewAngleId } from "@/lib/research/editor-review";

type EvidenceRow = {
  id: string;
  excerpt: string;
  stance: string;
  editor_notes: string | null;
  review_status?: string | null;
  reliability_notes?: string | null;
  page_label?: string | null;
  research_question?: string | null;
  sources:
    | {
        organization: string;
        title: string;
        url: string | null;
        published_label: string | null;
        published_on: string | null;
        category: string;
        reliability: string;
        tier_rank?: number | null;
      }
    | {
        organization: string;
        title: string;
        url: string | null;
        published_label: string | null;
        published_on: string | null;
        category: string;
        reliability: string;
        tier_rank?: number | null;
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
  conversation_id?: string | null;
  original_post_id?: string | null;
  importance?: string | null;
  importance_reason?: string | null;
  verifiability_reason?: string | null;
  evidence_needed?: string | null;
  ai_confidence?: string | null;
  mentioned_entities?: string[] | null;
  content_pillar?: string | null;
  statement_kind?: string | null;
  claim_types?: string[] | null;
  research_questions?: string[] | null;
  attribution_note?: string | null;
  proposed_verdict?: string | null;
  verdict_reasoning?: string | null;
  verdict_caveats?: string | null;
  verdict_unknown?: string | null;
  verdict_confidence?: string | null;
  working_notes?: string | null;
  editor_review?: unknown;
  verdict_recorded_at?: string | null;
  verdict_recorded_by?: string | null;
  verdict_evidence_used?: unknown;
  editor_angle?: string | null;
  editor_angle_text?: string | null;
  editor_take?: string | null;
  format_recommendation?: string | null;
  topics: { name: string } | { name: string }[] | null;
  evidence: EvidenceRow[] | null;
  drafts: { id: string; status: string }[] | null;
};

const claimSelect = `
  id, claim_text, original_author, original_author_username, original_author_role,
  original_post_text, original_post_url, original_post_id, conversation_id, detected_at, engagement, status,
  verification_confidence, editor_notes, suggested_hashtag, origin,
  topics ( name ),
  evidence ( id, excerpt, stance, editor_notes, sources ( organization, title, url, published_label, published_on, category, reliability ) ),
  drafts ( id, status )
`;

const richClaimSelect = `
  id, claim_text, original_author, original_author_username, original_author_role,
  original_post_text, original_post_url, original_post_id, conversation_id, detected_at, engagement, status,
  verification_confidence, editor_notes, suggested_hashtag, origin,
  importance, importance_reason, verifiability_reason, evidence_needed, ai_confidence, mentioned_entities,
  content_pillar, statement_kind, claim_types, research_questions, attribution_note,
  proposed_verdict, verdict_reasoning, verdict_caveats, verdict_unknown, verdict_confidence, working_notes,
  editor_review, verdict_recorded_at, verdict_recorded_by, verdict_evidence_used,
  editor_angle, editor_angle_text, editor_take, format_recommendation,
  topics ( name ),
  evidence ( id, excerpt, stance, editor_notes, review_status, reliability_notes, page_label, research_question, sources ( organization, title, url, published_label, published_on, category, reliability, tier_rank ) ),
  drafts ( id, status )
`;

const importanceLabel: Record<string, ImportanceLabel> = { high: "High", medium: "Medium", low: "Low" };

const emptyFormat: FormatDecision = {
  current: "Unverified",
  notTrueAvailable: false,
  notTrueReason: "Not available. #NotTrue waits for collected evidence that contradicts the claim at high confidence.",
};

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
        review: row.review_status === "accepted" || row.review_status === "rejected" ? row.review_status : "proposed",
        tierRank: typeof source.tier_rank === "number" ? source.tier_rank : 4,
        reliabilityNotes: row.reliability_notes ?? null,
        pageLabel: row.page_label ?? null,
        researchQuestion: row.research_question ?? null,
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
    importance: row.importance ? importanceLabel[row.importance] ?? null : null,
    entities: (row.mentioned_entities ?? []).filter((entity) => typeof entity === "string"),
    conversationSize: typeof row.engagement?.conversationPosts === "number" ? row.engagement.conversationPosts : null,
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
    importanceReason: row.importance_reason ?? null,
    verifiability: row.verifiability_reason ?? null,
    evidenceNeeded: row.evidence_needed ?? null,
    aiConfidence: confidenceLabel(row.ai_confidence ?? null),
    relatedPosts: [],
    format: editorialFormat({
      status: base.status,
      confidence: base.confidence,
      hashtag: row.suggested_hashtag,
      evidence: evidenceOf(row.evidence),
      statementKind: row.statement_kind === "fact" || row.statement_kind === "analysis" || row.statement_kind === "opinion" ? row.statement_kind : null,
      workingNotes: row.working_notes ?? null,
    }),
    pillar: row.content_pillar === "politics" || row.content_pillar === "football" || row.content_pillar === "finance" ? row.content_pillar : null,
    statementKind: row.statement_kind === "fact" || row.statement_kind === "analysis" || row.statement_kind === "opinion" ? row.statement_kind : null,
    claimTypes: row.claim_types ?? [],
    questions: row.research_questions ?? [],
    attribution: row.attribution_note ?? null,
    proposedVerdict: row.proposed_verdict ?? null,
    verdictReasoning: row.verdict_reasoning ?? null,
    verdictCaveats: row.verdict_caveats ?? null,
    verdictUnknown: row.verdict_unknown ?? null,
    verdictConfidence: confidenceLabel(row.verdict_confidence ?? null),
    workingNotes: row.working_notes ?? null,
    editorReview: parseEditorReview(row.editor_review),
    verdictRecordedAt: row.verdict_recorded_at ?? null,
    verdictRecordedBy: row.verdict_recorded_by ?? null,
    verdictEvidenceUsed: parseRecordedSources(row.verdict_evidence_used),
    editorAngle: angleOf(row.editor_angle),
    editorAngleText: row.editor_angle_text ?? null,
    editorTake: row.editor_take ?? null,
    formatRecommendation: row.format_recommendation === "#CheckAm" || row.format_recommendation === "#ShowYourWorking" ? row.format_recommendation : null,
  };
}

function angleOf(value: string | null | undefined): ReviewAngleId | null {
  if (value === "receipts" || value === "serious" || value === "trust" || value === "own") return value;
  return null;
}

function claimFailure(message: string) {
  return { ok: false as const, reason: schemaMissing(message) ? ("schema" as const) : ("unreachable" as const), message: scrubDbMessage(message) };
}

async function selectClaims(filter: { id?: string }) {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const };
  const primary = filter.id
    ? await db.from("claims").select(richClaimSelect).eq("id", filter.id).maybeSingle()
    : await db.from("claims").select(richClaimSelect).order("detected_at", { ascending: false });
  if (primary.error && columnMissing(primary.error.message)) {
    const fallback = filter.id
      ? await db.from("claims").select(claimSelect).eq("id", filter.id).maybeSingle()
      : await db.from("claims").select(claimSelect).order("detected_at", { ascending: false });
    if (fallback.error) return claimFailure(fallback.error.message);
    return { ok: true as const, data: fallback.data };
  }
  if (primary.error) return claimFailure(primary.error.message);
  return { ok: true as const, data: primary.data };
}

async function relatedPosts(conversationId: string | null, postId: string | null): Promise<RelatedPost[]> {
  const db = serviceClient();
  if (!db) return [];
  let query = db.from("x_posts").select("x_post_id, username, text, posted_at").limit(8);
  if (conversationId) query = query.eq("conversation_id", conversationId);
  else if (postId) query = query.eq("x_post_id", postId);
  else return [];
  const { data, error } = await query;
  if (error || !data) return [];
  return data.flatMap((row) => {
    const url = publicPostUrl(row.x_post_id, row.username);
    if (!url) return [];
    return [
      {
        id: row.x_post_id as string,
        username: row.username,
        text: row.text as string,
        url,
        postedAt: lagosStamp(row.posted_at),
      },
    ];
  });
}

export async function listClaims() {
  const result = await selectClaims({});
  if (!result.ok) return result;
  const claims = ((result.data ?? []) as unknown as ClaimRow[]).map(toClaim);
  return { ok: true as const, claims };
}

export async function getClaim(id: string) {
  const result = await selectClaims({ id });
  if (!result.ok) return { ok: false as const, reason: result.reason };
  if (!result.data) return { ok: true as const, claim: null };
  const row = result.data as unknown as ClaimRow;
  const claim = toClaim(row);
  claim.relatedPosts = await relatedPosts(row.conversation_id ?? null, row.original_post_id ?? null);
  if (claim.format.current === "Unverified" && claim.evidence.length === 0) claim.format = emptyFormat;
  return { ok: true as const, claim };
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
