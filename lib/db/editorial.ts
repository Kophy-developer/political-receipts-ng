import "server-only";
import { randomUUID } from "node:crypto";
import { planExtractionProviders } from "@/lib/ai/catalog";
import { readAiEnv } from "@/lib/ai/runtime";
import { callProvider } from "@/lib/ai/transport";
import { calledToday, persistAttempts } from "@/lib/db/ai-attempts";
import { columnMissing, schemaMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";
import { isUuid } from "@/lib/db/labels";
import { publishedByClaim } from "@/lib/db/publishing";
import { editorialMaxTokens } from "@/lib/editorial/ai";
import { mergeAssessments, nextAssessmentVersion, type Lifecycle, type PipelineCard } from "@/lib/editorial/model";
import { packetsFromPosts, type StoredAssessmentPost } from "@/lib/editorial/packet";
import { withUnderstandVersions } from "@/lib/editorial/trace";
import { understandPackets } from "@/lib/editorial/understand-ai";
import { splitByCurrentVersion } from "@/lib/editorial/history";
import { describeSource, replaceUserLabel } from "@/lib/editorial/quality";
import { inboxRecords, understandingOutcomeMessage } from "@/lib/editorial/understand";

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
  "understanding",
  "development",
].join(", ");

function textOf(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberOf(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function understandingOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const routes = Array.isArray(row.routes) ? row.routes.filter((item): item is string => typeof item === "string") : [];
  return {
    primaryKind: typeof row.primaryKind === "string" ? row.primaryKind : null,
    routes,
    sourceText: typeof row.sourceText === "string" ? row.sourceText : null,
    lowValue: row.lowValue === true,
    inboxStatus: typeof row.status === "string" ? row.status : null,
  };
}

function cardFrom(row: Record<string, unknown>): PipelineCard {
  const understanding = understandingOf(row.understanding);
  const card: PipelineCard = {
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
    status: understanding?.inboxStatus ?? textOf(row.status) ?? "open",
    claimExtractionNeeded: row.claim_extraction_needed === true,
    version: numberOf(row.assessment_version),
    scanId: textOf(row.scan_id),
    pillar: textOf(row.content_pillar),
    primaryKind: understanding?.primaryKind ?? null,
    routes: understanding?.routes ?? [],
    sourceText: understanding?.sourceText ?? null,
    lowValue: understanding?.lowValue ?? false,
    review: null,
    draftingCandidate: true,
    premises: [],
    ...developmentOf(row.development),
  };
  return card;
}

function developmentOf(value: unknown): Pick<PipelineCard, "developmentAngle" | "developmentUnresolved" | "developmentDrafts"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { developmentAngle: null, developmentUnresolved: null, developmentDrafts: [] };
  }
  const row = value as { angle?: unknown; unresolved?: unknown; drafts?: unknown };
  const drafts = Array.isArray(row.drafts)
    ? row.drafts.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const text = (item as { text?: unknown }).text;
        return typeof text === "string" && text.trim() ? [text] : [];
      })
    : [];
  return {
    developmentAngle: typeof row.angle === "string" ? row.angle : null,
    developmentUnresolved: typeof row.unresolved === "string" ? row.unresolved : null,
    developmentDrafts: drafts,
  };
}

function presentCurrent(card: PipelineCard): PipelineCard {
  const described = card.sourceText ? describeSource(card.sourceText) : null;
  if (!described?.matched) return { ...card, title: replaceUserLabel(card.title) };
  return {
    ...card,
    title: described.summary,
    type: described.routes[0]?.toLowerCase() ?? card.type,
    research: described.researchNeed,
    reason: described.reason,
    primaryKind: described.primaryKind,
    routes: described.routes,
    lowValue: described.lowValue,
    review: described.review,
    draftingCandidate: described.draftingCandidate,
    premises: described.checkableFacts,
    claimExtractionNeeded: described.routes.includes("CHECK"),
  };
}

export async function listPipeline() {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const, cards: [] as PipelineCard[], earlier: [] as PipelineCard[], history: [] as PipelineCard[] };
  let primary = await db.from("opportunities").select(pipelineColumns).order("created_at", { ascending: false });
  if (primary.error && columnMissing(primary.error.message) && /development|understanding/i.test(primary.error.message)) {
    const missing = /development/i.test(primary.error.message) ? "development" : "understanding";
    const reduced = pipelineColumns.split(", ").filter((column) => column !== missing).join(", ");
    primary = await db.from("opportunities").select(reduced).order("created_at", { ascending: false });
  }
  if (primary.error && (columnMissing(primary.error.message) || schemaMissing(primary.error.message))) {
    const fallback = await db
      .from("opportunities")
      .select("id, conversation_id, claim_id, opportunity_type, research_required, score, what_happened, why_interesting, what_could_add, status, source, scan_id, content_pillar")
      .order("created_at", { ascending: false });
    if (fallback.error) return { ok: true as const, reason: "pending" as const, cards: [] as PipelineCard[], earlier: [] as PipelineCard[], history: [] as PipelineCard[] };
    return {
      ok: true as const,
      reason: "pending" as const,
      cards: [] as PipelineCard[],
      earlier: (fallback.data ?? []).map((row) => cardFrom(row as unknown as Record<string, unknown>)),
      history: [] as PipelineCard[],
    };
  }
  if (primary.error) return { ok: false as const, reason: "unreachable" as const, cards: [] as PipelineCard[], earlier: [] as PipelineCard[], history: [] as PipelineCard[] };
  const cards = (primary.data ?? []).map((row) => cardFrom(row as unknown as Record<string, unknown>));
  const split = splitByCurrentVersion(cards);
  return {
    ok: true as const,
    reason: "ready" as const,
    cards: split.current.filter((card) => card.source === "assessment").map(presentCurrent),
    earlier: split.current.filter((card) => card.source !== "assessment").map(presentCurrent),
    history: split.history,
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
  const detailed = await db
    .from("x_posts")
    .select("text, username, conversation_id, posted_at, referenced, content_pillar")
    .eq("scan_id", scanId)
    .order("posted_at", { ascending: true });
  const posts = detailed.error && columnMissing(detailed.error.message)
    ? await db.from("x_posts").select("text, username, conversation_id, posted_at").eq("scan_id", scanId).order("posted_at", { ascending: true })
    : detailed;
  if (posts.error) return { ...empty, message: "Stored posts could not be read." };
  const stored: StoredAssessmentPost[] = [];
  for (const row of posts.data ?? []) {
    if (!isUuid(String(row.conversation_id ?? ""))) continue;
    stored.push({
      text: typeof row.text === "string" ? row.text : null,
      username: typeof row.username === "string" ? row.username : null,
      postedAt: typeof row.posted_at === "string" ? row.posted_at : null,
      conversationId: String(row.conversation_id),
      referenced: "referenced" in row ? row.referenced : undefined,
      contentPillar: "content_pillar" in row && typeof row.content_pillar === "string" ? row.content_pillar : null,
    });
  }
  const packets = packetsFromPosts(stored).filter((packet) => packet.posts.length > 0);
  if (packets.length === 0) return { ...empty, message: "That scan has no stored conversations to reassess." };
  const used = await calledToday();
  const understood = await understandPackets({
    requestId: randomUUID(),
    packets,
    plans: planExtractionProviders(readAiEnv(), used),
    call: (plan, request) => callProvider(plan, request, { maxTokens: editorialMaxTokens, temperature: 0 }),
  });
  if (!understood.ok || !understood.routed) {
    await persistAttempts(understood.attempts);
    return {
      ...empty,
      modelCalls: understood.modelCalls,
      message: understood.failureMessage
        ? `${understood.failureMessage} Earlier cards were left in place. Nothing was published.`
        : "The stored conversations could not be understood. Earlier cards were left in place. No X request or research call was made, and nothing was published.",
    };
  }
  const ranked = understood.routed;
  const existingOpportunities = await db.from("opportunities").select("id").eq("scan_id", scanId);
  const previousIds = (existingOpportunities.data ?? []).map((row) => String(row.id));
  const versions = await db.from("editorial_assessments").select("conversation_id, version").eq("scan_id", scanId);
  if (versions.error && schemaMissing(versions.error.message)) {
    await persistAttempts(understood.attempts);
    return { ...empty, message: "The editorial assessment table is not available yet. Nothing was deleted." };
  }
  if (versions.error) {
    await persistAttempts(understood.attempts);
    return { ...empty, message: scrubDbMessage(versions.error.message) };
  }
  const maxByConversation = new Map<string, number>();
  for (const row of versions.data ?? []) {
    const id = String(row.conversation_id);
    const version = typeof row.version === "number" ? row.version : 0;
    maxByConversation.set(id, Math.max(maxByConversation.get(id) ?? 0, version));
  }
  const versionByConversation: Record<string, number> = {};
  for (const item of ranked) versionByConversation[item.id] = nextAssessmentVersion(maxByConversation.get(item.id) ?? null);
  await persistAttempts(understood.attempts.map((attempt) => (
    attempt.response ? { ...attempt, response: withUnderstandVersions(attempt.response, versionByConversation) } : attempt
  )));
  const inserted: string[] = [];
  for (const item of ranked) {
    const version = versionByConversation[item.id] ?? nextAssessmentVersion(maxByConversation.get(item.id) ?? null);
    const records = inboxRecords(item, scanId, version);
    let assessment = await db.from("editorial_assessments").insert(records.assessment).select("id").single();
    if (assessment.error && columnMissing(assessment.error.message)) {
      const withoutBasis = Object.fromEntries(Object.entries(records.assessment).filter(([key]) => key !== "editorial_basis"));
      assessment = await db.from("editorial_assessments").insert(withoutBasis).select("id").single();
    }
    if (assessment.error || !assessment.data) {
      return { ...empty, modelCalls: understood.modelCalls, message: "The new understanding was not saved. Earlier cards were left in place." };
    }
    let opportunity = await db.from("opportunities").insert(records.opportunity).select("id").single();
    if (opportunity.error && columnMissing(opportunity.error.message)) {
      const withoutUnderstanding = Object.fromEntries(Object.entries(records.opportunity).filter(([key]) => key !== "understanding"));
      opportunity = await db.from("opportunities").insert(withoutUnderstanding).select("id").single();
    }
    if (opportunity.error || !opportunity.data) {
      return { ...empty, message: "The queue card was not saved. Earlier cards were left in place." };
    }
    inserted.push(String(opportunity.data.id));
    await recordEvent({
      action: "opportunity filed",
      actor: "desk",
      subjectType: "opportunity",
      subjectId: String(opportunity.data.id),
      detail: { source: "understanding", version, lifecycle: item.lifecycle, xRequests: 0, modelCalls: understood.modelCalls, researchCalls: 0 },
    });
  }
  const merge = mergeAssessments(previousIds, inserted);
  const queued = ranked.filter((item) => item.lifecycle === "RANKED").length;
  const passed = ranked.length - queued;
  return {
    ok: true as const,
    xRequests: 0 as const,
    modelCalls: understood.modelCalls,
    researchCalls: 0 as const,
    posted: false as const,
    conversations: ranked.length,
    worthwhile: queued,
    passed,
    preserved: merge.kept.length,
    deleted: merge.deleted.length,
    message: understandingOutcomeMessage({
      received: ranked.length,
      understood: queued,
      unclear: passed,
      modelCalls: understood.modelCalls,
    }),
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
