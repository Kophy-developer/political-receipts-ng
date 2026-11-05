import "server-only";
import { recordEvent } from "@/lib/db/events";
import { columnMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { isUuid } from "@/lib/db/labels";
import { proposeVerdict } from "@/lib/research/verdict";
import { inferClaimTypes, questionsFor } from "@/lib/research/claim-types";
import type { Pillar, StatementKind } from "@/lib/research/types";
import { proposeOpportunities, proposeSampleReading, type OpportunityPost } from "@/lib/opportunities/rules";
import { reclassifyStoredPosts } from "@/lib/intel/reclassify";
import { extractionOpportunityWrite } from "@/lib/intel/stage";
import { opportunityTypes, type OpportunityAngle, type OpportunityCard, type OpportunityProposal, type OpportunityScore, type OpportunityType, type ResearchNeed } from "@/lib/opportunities/types";
import { publicPostUrl, sanitizeText } from "@/lib/intel/text";

const needs = new Set<ResearchNeed>(["yes", "recommended", "no"]);
const scores = new Set<OpportunityScore>(["high", "medium", "low"]);
const pillars = new Set<Pillar>(["politics", "football", "finance"]);

function voiceFor(type: OpportunityType): OpportunityProposal["voice"] {
  if (type === "check") return "fact";
  if (type === "analysis" || type === "original_insight") return "analysis";
  if (type === "humour") return "humour";
  if (type === "reaction") return "opinion";
  return "opinion";
}

type RulesRow = {
  id: string;
  opportunity_type: string;
  status: string;
  editor_take: string | null;
  claim_id: string | null;
  score_reason: string | null;
};

function kept(row: RulesRow) {
  return row.status !== "open" || Boolean(row.editor_take) || Boolean(row.claim_id);
}

function omit(body: Record<string, unknown>, keys: string[]) {
  const copy = { ...body };
  for (const key of keys) delete copy[key];
  return copy;
}

async function writeRulesCard(proposal: OpportunityProposal, conversationId: string | null, existingId?: string) {
  const db = serviceClient();
  if (!db) return null;
  const payload = rowFrom(proposal, conversationId, "rules");
  const write = async (body: Record<string, unknown>) => {
    const record = existingId ? omit(body, ["status"]) : body;
    if (existingId) return db.from("opportunities").update(record).eq("id", existingId).select("id").single();
    return db.from("opportunities").insert(record).select("id").single();
  };
  let result = await write(payload);
  if (result.error && columnMissing(result.error.message)) result = await write(omit(payload, ["post_count", "account_count"]));
  if (result.error || !result.data) return null;
  return result.data.id as string;
}

export async function reviewStoredConversations() {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const refreshed = await reclassifyStoredPosts();
  if (!refreshed.ok) return { ok: false as const, message: refreshed.message };
  const posts = await db.from("x_posts").select("conversation_id, text, username, x_post_id, desk_class");
  if (posts.error) return { ok: false as const, message: scrubDbMessage(posts.error.message) };
  const grouped = new Map<string, OpportunityPost[]>();
  const samplePosts: OpportunityPost[] = [];
  for (const row of posts.data ?? []) {
    if (typeof row.text !== "string") continue;
    const item = { text: row.text, username: typeof row.username === "string" ? row.username : null };
    samplePosts.push(item);
    if (typeof row.conversation_id !== "string") continue;
    const list = grouped.get(row.conversation_id) ?? [];
    list.push(item);
    grouped.set(row.conversation_id, list);
  }
  const counts: Record<OpportunityType, number> = { reaction: 0, opinion: 0, check: 0, analysis: 0, original_insight: 0, humour: 0, question: 0 };
  const scoreCounts = { high: 0, medium: 0, low: 0 };
  const researchCounts = { yes: 0, recommended: 0, no: 0 };
  let filed = 0;
  let updated = 0;
  let removed = 0;
  let quiet = 0;
  const reviewed = new Set<string>();
  for (const [conversationId, conversationPosts] of grouped) {
    reviewed.add(conversationId);
    const reading = proposeOpportunities(conversationPosts);
    await db.from("opportunity_reviews").insert({
      conversation_id: conversationId,
      model_status: "unavailable",
      rules_status: reading.worthSaying ? "filed" : "nothing_to_say",
      note: `Opportunity analysis unavailable. ${reading.note}`,
    });
    const sync = await syncRules(conversationId, reading.proposals);
    filed += sync.filed;
    updated += sync.updated;
    removed += sync.removed;
    if (!reading.worthSaying) quiet += 1;
    for (const proposal of sync.live) {
      counts[proposal.type] += 1;
      scoreCounts[proposal.score] += 1;
      researchCounts[proposal.research] += 1;
    }
  }
  const sample = proposeSampleReading(samplePosts);
  if (sample) {
    const sync = await syncSample(sample);
    filed += sync.filed;
    updated += sync.updated;
    if (sync.live) {
      counts[sample.type] += 1;
      scoreCounts[sample.score] += 1;
      researchCounts[sample.research] += 1;
    }
  }
  const stale = await db.from("opportunities").select("id, conversation_id, status, source, editor_take, claim_id").eq("source", "rules").eq("status", "open");
  if (!stale.error) {
    for (const row of stale.data ?? []) {
      if (row.editor_take || row.claim_id) continue;
      if (typeof row.conversation_id === "string" && reviewed.has(row.conversation_id)) continue;
      if (row.conversation_id == null) continue;
      const deleted = await db.from("opportunities").delete().eq("id", row.id).eq("status", "open").eq("source", "rules");
      if (!deleted.error) removed += 1;
    }
  }
  const classCounts = { actionable: 0, discussion: 0, noise: 0 };
  for (const row of posts.data ?? []) {
    const deskClass = typeof row.desk_class === "string" ? row.desk_class : "";
    if (deskClass === "actionable" || deskClass === "discussion" || deskClass === "noise") classCounts[deskClass] += 1;
  }
  return {
    ok: true as const,
    conversations: grouped.size,
    filed,
    updated,
    removed,
    quiet,
    counts,
    scoreCounts,
    researchCounts,
    classCounts,
    rescued: refreshed.rescued,
    rescuedPosts: refreshed.rescuedPosts,
    posts: refreshed.posts,
    model: "not_called" as const,
    xRequests: 0,
    searches: 0,
    tavily: 0,
    brave: 0,
    posted: false,
    message: `Reviewed ${grouped.size} conversations. ${refreshed.rescued} posts left noise because a proposition remained. ${removed} redundant cards were removed. The model was not called.`,
  };
}

async function syncRules(conversationId: string, proposals: OpportunityProposal[]) {
  const db = serviceClient();
  const empty = { filed: 0, updated: 0, removed: 0, live: [] as OpportunityProposal[] };
  if (!db) return empty;
  const existing = await db
    .from("opportunities")
    .select("id, opportunity_type, status, editor_take, claim_id, score_reason")
    .eq("conversation_id", conversationId)
    .eq("source", "rules");
  const rows = (existing.data ?? []) as RulesRow[];
  let filed = 0;
  let updated = 0;
  let removed = 0;
  const live: OpportunityProposal[] = [];
  for (const row of rows) {
    const proposal = proposals.find((item) => item.type === row.opportunity_type);
    if (!proposal) {
      if (kept(row)) {
        continue;
      }
      const deleted = await db.from("opportunities").delete().eq("id", row.id).eq("status", "open").eq("source", "rules");
      if (!deleted.error) removed += 1;
      continue;
    }
    const id = await writeRulesCard(proposal, conversationId, row.id);
    if (id) {
      updated += 1;
      live.push(proposal);
    }
  }
  for (const proposal of proposals) {
    if (rows.some((row) => row.opportunity_type === proposal.type)) continue;
    const id = await writeRulesCard(proposal, conversationId);
    if (!id) continue;
    filed += 1;
    live.push(proposal);
    await recordEvent({
      action: "opportunity filed",
      actor: "desk",
      subjectType: "opportunity",
      subjectId: id,
      detail: { type: proposal.type, source: "rules", research: proposal.research },
    });
  }
  return { filed, updated, removed, live };
}

async function syncSample(proposal: OpportunityProposal) {
  const db = serviceClient();
  if (!db) return { filed: 0, updated: 0, live: false };
  const existing = await db
    .from("opportunities")
    .select("id, status, editor_take, claim_id, score_reason")
    .eq("source", "rules")
    .eq("opportunity_type", "analysis")
    .is("conversation_id", null);
  const row = (existing.data ?? []).find((item) => typeof item.score_reason === "string" && item.score_reason.includes("Sample across stored posts."));
  if (row && !kept(row as RulesRow)) {
    const id = await writeRulesCard(proposal, null, row.id as string);
    return { filed: 0, updated: id ? 1 : 0, live: Boolean(id) };
  }
  if (row) return { filed: 0, updated: 0, live: true };
  const id = await writeRulesCard(proposal, null);
  if (!id) return { filed: 0, updated: 0, live: false };
  await recordEvent({
    action: "opportunity filed",
    actor: "desk",
    subjectType: "opportunity",
    subjectId: id,
    detail: { type: proposal.type, source: "rules", research: proposal.research, sample: true },
  });
  return { filed: 1, updated: 0, live: true };
}

function rowFrom(proposal: OpportunityProposal, conversationId: string | null, source: "rules" | "manual") {
  return {
    conversation_id: conversationId,
    content_pillar: "politics",
    opportunity_type: proposal.type,
    research_required: proposal.research,
    score: proposal.score,
    score_reason: proposal.scoreReason,
    what_happened: proposal.whatHappened,
    why_interesting: proposal.whyInteresting,
    what_could_add: proposal.whatCouldAdd,
    angles: proposal.angles,
    research_questions: proposal.questions,
    voice: proposal.voice,
    status: "open",
    source,
    origin: "live",
    post_count: proposal.postCount,
    account_count: proposal.accountCount,
  };
}

export async function createManualOpportunity(input: {
  conversationId: string;
  type: string;
  research: string;
  score: string;
  whatHappened: string;
  whyInteresting: string;
  whatCouldAdd: string;
  pillar: string;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  if (!opportunityTypes.includes(input.type as OpportunityType)) return { ok: false as const, message: "Choose a content type." };
  if (!needs.has(input.research as ResearchNeed)) return { ok: false as const, message: "Say whether research is needed." };
  if (!scores.has(input.score as OpportunityScore)) return { ok: false as const, message: "Choose a score." };
  if (input.pillar && !pillars.has(input.pillar as Pillar)) return { ok: false as const, message: "Choose a pillar." };
  const type = input.type as OpportunityType;
  const what = sanitizeText(input.whatHappened, 400);
  const why = sanitizeText(input.whyInteresting, 400);
  const add = sanitizeText(input.whatCouldAdd, 400);
  if (what.length < 12 || why.length < 12 || add.length < 12) return { ok: false as const, message: "Each of the three notes needs a full sentence." };
  let conversationId: string | null = null;
  if (input.conversationId.trim()) {
    if (!isUuid(input.conversationId.trim())) return { ok: false as const, message: "That conversation is not on the desk." };
    conversationId = input.conversationId.trim();
  }
  const proposal: OpportunityProposal = {
    type,
    research: input.research as ResearchNeed,
    score: input.score as OpportunityScore,
    scoreReason: "Scored by the editor. This card was filed by hand.",
    whatHappened: what,
    whyInteresting: why,
    whatCouldAdd: add,
    angles: [],
    questions: type === "check" ? ["What record would confirm or contradict the factual sentence?"] : [],
    voice: voiceFor(type),
    postCount: 0,
    accountCount: 0,
  };
  const { data, error } = await db.from("opportunities").insert({ ...rowFrom(proposal, conversationId, "manual"), content_pillar: input.pillar || "politics" }).select("id").single();
  if (error || !data) return { ok: false as const, message: scrubDbMessage(error?.message || "opportunity") };
  await recordEvent({ action: "opportunity filed", actor: "editor", subjectType: "opportunity", subjectId: data.id, detail: { type, source: "manual" } });
  return { ok: true as const, id: data.id as string };
}

export async function decideOpportunity(input: { id: string; action: string; angle?: string; take?: string }) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  if (!isUuid(input.id)) return { ok: false as const, message: "That opportunity is not on the desk." };
  const row = await db.from("opportunities").select("id, status, conversation_id, what_happened, research_questions, angles, opportunity_type, voice, content_pillar, research_required").eq("id", input.id).maybeSingle();
  if (row.error || !row.data) return { ok: false as const, message: "That opportunity is not on the desk." };
  if (input.action === "promote" || input.action === "pass") {
    const ranked = await db.from("opportunities").select("queue_rank").eq("lifecycle", "RANKED");
    const nextRank = (ranked.data ?? []).reduce((max, row) => Math.max(max, typeof row.queue_rank === "number" ? row.queue_rank : 0), 0) + 1;
    const patch = input.action === "promote"
      ? { status: "open", lifecycle: "RANKED", queue_rank: nextRank, pass_reason: null }
      : { status: "ignored", lifecycle: "PASSED", queue_rank: null, pass_reason: "Passed by the editor." };
    let updated = await db.from("opportunities").update(patch).eq("id", input.id);
    if (updated.error && columnMissing(updated.error.message)) {
      updated = await db.from("opportunities").update({ status: patch.status }).eq("id", input.id);
    }
    if (updated.error) return { ok: false as const, message: scrubDbMessage(updated.error.message), xRequests: 0 as const, posted: false as const };
    await recordEvent({
      action: "opportunity decided",
      actor: "editor",
      subjectType: "opportunity",
      subjectId: input.id,
      detail: { status: patch.status, lifecycle: input.action === "promote" ? "RANKED" : "PASSED", modelCalls: 0, xRequests: 0 },
    });
    return {
      ok: true as const,
      xRequests: 0 as const,
      posted: false as const,
      message: input.action === "promote"
        ? "Moved into the content queue. No model was called."
        : "Passed. It stays on the desk, and nothing was published.",
    };
  }
  if (input.action === "ignore" || input.action === "save") {
    const status = input.action === "ignore" ? "ignored" : "saved";
    const { error } = await db.from("opportunities").update({ status }).eq("id", input.id);
    if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
    await recordEvent({ action: "opportunity decided", actor: "editor", subjectType: "opportunity", subjectId: input.id, detail: { status } });
    return { ok: true as const, message: status === "ignored" ? "Set aside." : "Saved for later." };
  }
  if (input.action === "talk") {
    const angle = sanitizeText(input.angle ?? "", 160);
    const take = sanitizeText(input.take ?? "", 500);
    if (!angle && !take) return { ok: false as const, message: "Choose an angle or write your take. The desk will not invent one." };
    const { error } = await db.from("opportunities").update({ status: "talk", editor_angle: angle || null, editor_take: take || null }).eq("id", input.id);
    if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
    await recordEvent({ action: "opportunity decided", actor: "editor", subjectType: "opportunity", subjectId: input.id, detail: { status: "talk" } });
    return { ok: true as const, message: "Your take is filed. Nothing was drafted for you, and nothing was posted." };
  }
  if (input.action === "research") {
    const sent = await sendToResearch(row.data, sanitizeText(input.angle ?? "", 160));
    return sent;
  }
  return { ok: false as const, message: "That decision is not available." };
}

async function sendToResearch(row: {
  id: string;
  conversation_id: string | null;
  what_happened: string;
  research_questions: string[] | null;
  angles: unknown;
  opportunity_type: string;
  voice: string;
  content_pillar: string;
}, angleTitle: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const angles = Array.isArray(row.angles) ? (row.angles as OpportunityAngle[]) : [];
  const chosen = angles.find((item) => item.title === angleTitle);
  const questions = (chosen?.questions?.length ? chosen.questions : row.research_questions ?? []).slice(0, 4);
  if (questions.length === 0 && row.opportunity_type !== "check") {
    questions.push("Is there a factual sentence here, or only a view?");
  }
  const pillar: Pillar = row.content_pillar === "football" || row.content_pillar === "finance" ? row.content_pillar : "politics";
  const prediction = row.voice === "prediction";
  const kind: StatementKind = prediction ? "opinion" : row.voice === "analysis" ? "analysis" : row.voice === "fact" ? "fact" : "opinion";
  const claimText = sanitizeText(row.what_happened, 500);
  const types = inferClaimTypes(claimText, pillar);
  const post = row.conversation_id
    ? await db.from("x_posts").select("x_post_id, username, text").eq("conversation_id", row.conversation_id).limit(1).maybeSingle()
    : { data: null };
  const verdict = prediction
    ? {
        factual: null,
        reasoning: "This is a prediction. The desk does not forecast the result, and it does not assign a factual verdict.",
        caveats: "A separate checkable sentence would need its own opportunity.",
        unknown: "No winner is predicted.",
        confidence: null,
        attribution: "Not a factual claim.",
      }
    : proposeVerdict({ statementKind: kind, evidence: [] });
  const claim = await db.from("claims").insert({
    claim_text: claimText,
    conversation_id: row.conversation_id,
    original_post_id: post.data?.x_post_id ?? null,
    original_post_url: post.data ? publicPostUrl(post.data.x_post_id, post.data.username) : null,
    original_author_username: post.data?.username ?? null,
    original_post_text: post.data?.text ?? null,
    detected_at: new Date().toISOString(),
    origin: "live",
    status: "new",
    content_pillar: pillar,
    statement_kind: kind,
    claim_types: types,
    research_questions: questions.length ? questions : questionsFor(types, pillar).map((item) => item.question).slice(0, 4),
    proposed_verdict: verdict.factual,
    verdict_reasoning: verdict.reasoning,
    verdict_caveats: verdict.caveats,
    verdict_unknown: verdict.unknown,
    verdict_confidence: verdict.confidence,
    attribution_note: verdict.attribution,
    editor_notes: angleTitle ? `Angle: ${angleTitle}` : "Sent from an opportunity. Research is not started.",
  }).select("id").single();
  if (claim.error || !claim.data) return { ok: false as const, message: scrubDbMessage(claim.error?.message || "claim") };
  await db.from("opportunities").update({ status: "research", claim_id: claim.data.id, editor_angle: angleTitle || null }).eq("id", row.id);
  await recordEvent({ action: "research sent", actor: "editor", subjectType: "opportunity", subjectId: row.id, detail: { claimId: claim.data.id } });
  return { ok: true as const, message: "A dossier is open. Research has not started.", claimId: claim.data.id as string };
}

export async function syncModelOpportunities(
  links: Array<{ conversationId: string; claimId: string | null; title: string; why: string; needed: string }>,
  scanId: string | null = null,
) {
  const db = serviceClient();
  const empty = { found: 0, created: 0, updated: 0, cards: [] as Array<{ id: string; title: string; claimId: string | null }> };
  if (!db) return empty;
  const seen = new Set<string>();
  const cards: Array<{ id: string; title: string; claimId: string | null }> = [];
  let created = 0;
  let updated = 0;
  for (const link of links) {
    if (seen.has(link.conversationId)) continue;
    seen.add(link.conversationId);
    const existing = await db
      .from("opportunities")
      .select("id, status, editor_take")
      .eq("conversation_id", link.conversationId)
      .eq("opportunity_type", "check")
      .eq("source", "model")
      .limit(1);
    const row = existing.data?.[0];
    const current = row
      ? { status: String(row.status), editorTake: typeof row.editor_take === "string" ? row.editor_take : null }
      : null;
    const decision = extractionOpportunityWrite(current);
    const fields = {
      what_happened: link.title.slice(0, 500),
      why_interesting: link.why.slice(0, 500),
      what_could_add: link.needed.slice(0, 500),
      claim_id: link.claimId,
    };
    if (decision === "keep" && row?.id) {
      cards.push({ id: String(row.id), title: link.title, claimId: link.claimId });
      continue;
    }
    if (decision === "update" && row?.id) {
      const changes: Record<string, unknown> = { ...fields };
      if (scanId) changes.scan_id = scanId;
      const updatedRow = await db.from("opportunities").update(changes as typeof fields).eq("id", row.id);
      if (updatedRow.error && columnMissing(updatedRow.error.message) && scanId) {
        await db.from("opportunities").update(fields).eq("id", row.id);
      }
      updated += 1;
      cards.push({ id: String(row.id), title: link.title, claimId: link.claimId });
      continue;
    }
    const record = {
      conversation_id: link.conversationId,
      ...fields,
      content_pillar: "politics",
      opportunity_type: "check",
      research_required: "yes",
      score: "medium",
      score_reason: "Filed from the stored scan. The extraction asked only for a checkable sentence.",
      angles: [],
      research_questions: [],
      voice: "fact",
      status: "open",
      source: "model",
      origin: "live",
    };
    const payload: Record<string, unknown> = { ...record };
    if (scanId) payload.scan_id = scanId;
    let inserted = await db.from("opportunities").insert(payload as typeof record).select("id").single();
    if (inserted.error && columnMissing(inserted.error.message) && scanId) {
      inserted = await db.from("opportunities").insert(record).select("id").single();
    }
    if (!inserted.data?.id) continue;
    created += 1;
    cards.push({ id: String(inserted.data.id), title: link.title, claimId: link.claimId });
  }
  return { found: cards.length, created, updated, cards };
}

export async function listOpportunityDesk() {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const };
  const cardColumns = "id, conversation_id, claim_id, opportunity_type, research_required, score, score_reason, what_happened, why_interesting, what_could_add, angles, research_questions, voice, status, editor_angle, editor_take, source, scan_id, post_count, account_count, conversations ( title )";
  const cardColumnsNoScan = "id, conversation_id, claim_id, opportunity_type, research_required, score, score_reason, what_happened, why_interesting, what_could_add, angles, research_questions, voice, status, editor_angle, editor_take, source, post_count, account_count, conversations ( title )";
  const cardColumnsFallback = "id, conversation_id, claim_id, opportunity_type, research_required, score, score_reason, what_happened, why_interesting, what_could_add, angles, research_questions, voice, status, editor_angle, editor_take, source, conversations ( title )";
  const primaryCards = await db.from("opportunities").select(cardColumns).order("created_at", { ascending: false });
  const withoutScan = primaryCards.error && columnMissing(primaryCards.error.message)
    ? await db.from("opportunities").select(cardColumnsNoScan).order("created_at", { ascending: false })
    : primaryCards;
  const cardResult = withoutScan.error && columnMissing(withoutScan.error.message)
    ? await db.from("opportunities").select(cardColumnsFallback).order("created_at", { ascending: false })
    : withoutScan;
  const [reviews, conversations] = await Promise.all([
    db.from("opportunity_reviews").select("conversation_id, model_status, rules_status, note, created_at").order("created_at", { ascending: false }).limit(40),
    db.from("conversations").select("id, title, status").order("started_at", { ascending: false }),
  ]);
  if (cardResult.error) return { ok: false as const, reason: "unreachable" as const, message: scrubDbMessage(cardResult.error.message) };
  const items: OpportunityCard[] = (cardResult.data ?? []).map((row) => {
    const conversation = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations;
    return {
      id: row.id as string,
      conversationId: row.conversation_id,
      conversationTitle: conversation?.title ?? null,
      type: row.opportunity_type,
      research: row.research_required,
      score: row.score,
      scoreReason: row.score_reason,
      whatHappened: row.what_happened,
      whyInteresting: row.why_interesting,
      whatCouldAdd: row.what_could_add,
      angles: Array.isArray(row.angles) ? (row.angles as OpportunityAngle[]) : [],
      questions: row.research_questions ?? [],
      voice: row.voice,
      status: row.status,
      editorAngle: row.editor_angle,
      editorTake: row.editor_take,
      source: row.source,
      claimId: row.claim_id,
      scanId: typeof (row as unknown as { scan_id?: unknown }).scan_id === "string" ? (row as unknown as { scan_id: string }).scan_id : null,
      postCount: typeof (row as unknown as { post_count?: unknown }).post_count === "number" ? (row as unknown as { post_count: number }).post_count : null,
      accountCount: typeof (row as unknown as { account_count?: unknown }).account_count === "number" ? (row as unknown as { account_count: number }).account_count : null,
    };
  });
  return {
    ok: true as const,
    items,
    reviews: reviews.data ?? [],
    conversations: (conversations.data ?? []).map((row) => ({ id: row.id as string, title: row.title as string, status: row.status as string })),
  };
}
