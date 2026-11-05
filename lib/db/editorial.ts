import "server-only";
import { assessAndRank, type ConversationDraft } from "@/lib/editorial/assess";
import { mergeAssessments, nextAssessmentVersion, type Lifecycle, type PipelineCard, type RankedConversation } from "@/lib/editorial/model";
import { columnMissing, schemaMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";
import { isUuid } from "@/lib/db/labels";
import { publishedByClaim } from "@/lib/db/publishing";

const pipelineColumns = [
  "id",
  "conversation_id",
  "claim_id",
  "opportunity_type",
  "research_required",
  "score",
  "what_happened",
  "why_interesting",
  "what_could_add",
  "status",
  "source",
  "scan_id",
  "lifecycle",
  "queue_rank",
  "timeliness",
  "priority",
  "claim_extraction_needed",
  "pass_reason",
  "content_score",
  "assessment_version",
  "discovered_at",
  "possible_angle",
  "content_pillar",
].join(", ");

function textOf(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberOf(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cardFrom(row: Record<string, unknown>): PipelineCard {
  return {
    id: String(row.id),
    conversationId: textOf(row.conversation_id),
    claimId: textOf(row.claim_id),
    title: textOf(row.what_happened) ?? "Untitled opportunity",
    type: textOf(row.opportunity_type) ?? "opinion",
    priority: textOf(row.priority) ?? textOf(row.score),
    research: textOf(row.research_required) ?? "no",
    timeliness: textOf(row.timeliness),
    angle: textOf(row.possible_angle) ?? textOf(row.what_could_add) ?? "",
    reason: textOf(row.why_interesting) ?? "",
    passReason: textOf(row.pass_reason),
    rank: numberOf(row.queue_rank),
    lifecycle: textOf(row.lifecycle) ?? (textOf(row.status) === "ignored" ? "PASSED" : "RANKED"),
    discoveredAt: textOf(row.discovered_at),
    source: textOf(row.source) ?? "rules",
    status: textOf(row.status) ?? "open",
    claimExtractionNeeded: row.claim_extraction_needed === true,
    version: numberOf(row.assessment_version),
    scanId: textOf(row.scan_id),
    pillar: textOf(row.content_pillar),
  };
}

function latestAssessment(cards: PipelineCard[]) {
  const chosen = new Map<string, PipelineCard>();
  for (const card of cards) {
    const key = card.conversationId ?? card.id;
    const previous = chosen.get(key);
    if (!previous || (card.version ?? 0) > (previous.version ?? 0)) chosen.set(key, card);
  }
  return [...chosen.values()];
}

export async function listPipeline() {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const, cards: [] as PipelineCard[], earlier: [] as PipelineCard[] };
  const primary = await db.from("opportunities").select(pipelineColumns).order("created_at", { ascending: false });
  if (primary.error && (columnMissing(primary.error.message) || schemaMissing(primary.error.message))) {
    const fallback = await db
      .from("opportunities")
      .select("id, conversation_id, claim_id, opportunity_type, research_required, score, what_happened, why_interesting, what_could_add, status, source, scan_id, content_pillar")
      .order("created_at", { ascending: false });
    if (fallback.error) return { ok: true as const, reason: "pending" as const, cards: [] as PipelineCard[], earlier: [] as PipelineCard[] };
    return {
      ok: true as const,
      reason: "pending" as const,
      cards: [] as PipelineCard[],
      earlier: (fallback.data ?? []).map((row) => cardFrom(row as unknown as Record<string, unknown>)),
    };
  }
  if (primary.error) return { ok: false as const, reason: "unreachable" as const, cards: [] as PipelineCard[], earlier: [] as PipelineCard[] };
  const cards = (primary.data ?? []).map((row) => cardFrom(row as unknown as Record<string, unknown>));
  return {
    ok: true as const,
    reason: "ready" as const,
    cards: latestAssessment(cards.filter((card) => card.source === "assessment")),
    earlier: cards.filter((card) => card.source !== "assessment"),
  };
}

function opportunityRow(item: RankedConversation, scanId: string, version: number) {
  return {
    conversation_id: item.id,
    claim_id: null,
    scan_id: scanId,
    content_pillar: "politics",
    opportunity_type: item.opportunityType ?? "opinion",
    research_required: item.researchNeed ?? "no",
    score: item.priority ?? "low",
    score_reason: "Ranked as a content opportunity. People and parties are not scored.",
    what_happened: item.title,
    why_interesting: item.reason,
    what_could_add: item.possibleAngle || item.passReason || "No angle filed.",
    angles: [],
    research_questions: [],
    voice: item.voice,
    status: item.worthTalkingAbout ? "open" : "ignored",
    source: "assessment",
    origin: "live",
    lifecycle: item.lifecycle,
    queue_rank: item.rank,
    timeliness: item.timeliness,
    priority: item.priority,
    claim_extraction_needed: item.claimExtractionNeeded,
    pass_reason: item.passReason,
    content_score: item.contentScore,
    assessment_version: version,
    discovered_at: item.discoveredAt,
    possible_angle: item.possibleAngle,
  };
}

function assessmentRow(item: RankedConversation, scanId: string, version: number) {
  return {
    conversation_id: item.id,
    scan_id: scanId,
    version,
    worth_talking_about: item.worthTalkingAbout,
    opportunity_type: item.opportunityType,
    priority: item.priority,
    research_need: item.researchNeed,
    timeliness: item.timeliness,
    possible_angle: item.possibleAngle,
    reason: item.reason,
    pass_reason: item.passReason,
    claim_extraction_needed: item.claimExtractionNeeded,
    content_score: item.contentScore,
    queue_rank: item.rank,
    lifecycle: item.lifecycle,
    next_stage: item.nextStage,
    discovered_at: item.discoveredAt,
    source: "rules",
    model_called: false,
    x_requests: 0,
  };
}

export async function reassessSavedScan(scanId: string) {
  const empty = {
    ok: false as const,
    xRequests: 0 as const,
    modelCalls: 0 as const,
    researchCalls: 0 as const,
    posted: false as const,
    message: "The saved conversations could not be reassessed.",
  };
  const db = serviceClient();
  if (!db) return { ...empty, message: "The database is not configured." };
  if (!isUuid(scanId)) return { ...empty, message: "That scan is not on the desk." };
  const posts = await db
    .from("x_posts")
    .select("text, username, conversation_id, posted_at")
    .eq("scan_id", scanId);
  if (posts.error) return { ...empty, message: "Stored posts could not be read." };
  const grouped = new Map<string, { text: string[]; discoveredAt: string | null }>();
  for (const row of posts.data ?? []) {
    if (!isUuid(String(row.conversation_id ?? ""))) continue;
    const id = String(row.conversation_id);
    const bucket = grouped.get(id) ?? { text: [], discoveredAt: null };
    if (typeof row.text === "string" && row.text.trim()) bucket.text.push(row.text.trim());
    if (typeof row.posted_at === "string" && (!bucket.discoveredAt || row.posted_at < bucket.discoveredAt)) bucket.discoveredAt = row.posted_at;
    grouped.set(id, bucket);
  }
  const drafts: ConversationDraft[] = [...grouped.entries()].map(([id, bucket]) => ({
    id,
    text: bucket.text.join("\n"),
    discoveredAt: bucket.discoveredAt ?? undefined,
  }));
  if (drafts.length === 0) return { ...empty, message: "That scan has no stored conversations to reassess." };
  const ranked = assessAndRank(drafts);
  const existingOpportunities = await db.from("opportunities").select("id").eq("scan_id", scanId);
  const previousIds = (existingOpportunities.data ?? []).map((row) => String(row.id));
  const versions = await db.from("editorial_assessments").select("conversation_id, version").eq("scan_id", scanId);
  if (versions.error && schemaMissing(versions.error.message)) {
    return { ...empty, message: "The editorial assessment table is not available yet. Nothing was deleted." };
  }
  if (versions.error) return { ...empty, message: scrubDbMessage(versions.error.message) };
  const maxByConversation = new Map<string, number>();
  for (const row of versions.data ?? []) {
    const id = String(row.conversation_id);
    const version = typeof row.version === "number" ? row.version : 0;
    maxByConversation.set(id, Math.max(maxByConversation.get(id) ?? 0, version));
  }
  const inserted: string[] = [];
  for (const item of ranked) {
    const version = nextAssessmentVersion(maxByConversation.get(item.id) ?? null);
    const assessment = await db.from("editorial_assessments").insert(assessmentRow(item, scanId, version)).select("id").single();
    if (assessment.error || !assessment.data) {
      return { ...empty, message: "The new assessment version was not saved. Earlier cards were left in place." };
    }
    const opportunity = await db.from("opportunities").insert(opportunityRow(item, scanId, version)).select("id").single();
    if (opportunity.error || !opportunity.data) {
      return { ...empty, message: "The queue card was not saved. Earlier cards were left in place." };
    }
    inserted.push(String(opportunity.data.id));
    await recordEvent({
      action: "opportunity filed",
      actor: "desk",
      subjectType: "opportunity",
      subjectId: String(opportunity.data.id),
      detail: { source: "assessment", version, lifecycle: item.lifecycle, xRequests: 0, modelCalls: 0 },
    });
  }
  const merge = mergeAssessments(previousIds, inserted);
  const worthwhile = ranked.filter((item) => item.worthTalkingAbout).length;
  return {
    ok: true as const,
    xRequests: 0 as const,
    modelCalls: 0 as const,
    researchCalls: 0 as const,
    posted: false as const,
    conversations: ranked.length,
    worthwhile,
    passed: ranked.length - worthwhile,
    preserved: merge.kept.length,
    deleted: merge.deleted.length,
    message: `Reassessed ${ranked.length} stored conversations. ${worthwhile} are in the queue. Earlier cards were kept. No X request, model call, or research call was made.`,
  };
}

export async function passReadyClaim(id: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured.", xRequests: 0 as const, posted: false as const };
  if (!isUuid(id)) return { ok: false as const, message: "That story is not on the desk.", xRequests: 0 as const, posted: false as const };
  const published = await publishedByClaim();
  if (published.get(id)) return { ok: false as const, message: "A published story stays published.", xRequests: 0 as const, posted: false as const };
  const { error } = await db.from("claims").update({ status: "dismissed" }).eq("id", id);
  if (error) return { ok: false as const, message: scrubDbMessage(error.message), xRequests: 0 as const, posted: false as const };
  await recordEvent({ action: "claim dismissed", actor: "editor", subjectType: "claim", subjectId: id, detail: { from: "ready" } });
  return { ok: true as const, message: "Passed. Nothing was published.", xRequests: 0 as const, posted: false as const };
}

export function lifecycleOf(card: PipelineCard): Lifecycle | "EARLIER" {
  if (card.source !== "assessment") return "EARLIER";
  if (card.lifecycle === "DISCOVERED" || card.lifecycle === "ASSESSED" || card.lifecycle === "RANKED" || card.lifecycle === "RESEARCHING" || card.lifecycle === "EVIDENCE_READY" || card.lifecycle === "ANGLE_READY" || card.lifecycle === "DRAFTING" || card.lifecycle === "READY_FOR_EDITOR" || card.lifecycle === "APPROVED" || card.lifecycle === "PUBLISHED" || card.lifecycle === "PASSED") {
    return card.lifecycle;
  }
  return card.status === "ignored" ? "PASSED" : "RANKED";
}
